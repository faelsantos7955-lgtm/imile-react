"""
api/routes/extravios_upload.py — Processamento do Controle de Extravios
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from api.deps import get_db, get_current_user, require_admin, audit_log
from api.limiter import limiter
from api.upload_utils import validar_arquivo, detectar_aba
import pandas as pd
import io

router = APIRouter()

COLS_OBRIGATORIAS = [
    'Waybill', 'Reason', 'Resp', 'Date',
    'Uploaded Declared Value', 'Motivo PT', 'week', 'mês', 'SUPERVISOR',
]


_EXT_COLS_KEY = {"Waybill", "Reason", "Resp", "Date", "Motivo PT"}


def _processar(conteudo: bytes) -> dict:
    buf = io.BytesIO(conteudo)
    try:
        xl = pd.ExcelFile(buf)
    except Exception:
        raise HTTPException(400, "Arquivo inválido. Envie o Excel de Controle de Extravios.")

    # Tenta 'BD' por nome, depois detecta pela melhor aba
    if 'BD' in xl.sheet_names:
        aba = 'BD'
    else:
        aba = detectar_aba(xl, _EXT_COLS_KEY)
        if aba is None:
            raise HTTPException(
                400,
                f"Aba com dados de extravios não encontrada. "
                f"Abas presentes: {xl.sheet_names}. "
                f"Esperado aba 'BD' ou aba com colunas: {sorted(_EXT_COLS_KEY)}"
            )

    df = xl.parse(aba)
    df.columns = df.columns.str.strip()

    faltando = [c for c in COLS_OBRIGATORIAS if c not in df.columns]
    if faltando:
        raise HTTPException(400, f"Colunas ausentes na aba BD: {faltando}")

    # Filtra linhas válidas (Waybill numérico)
    df = df.dropna(subset=['Waybill']).copy()
    df['Waybill'] = df['Waybill'].astype(str).str.strip()
    df = df[df['Waybill'].str.match(r'^\d+$')].copy()

    if df.empty:
        raise HTTPException(400, "Nenhum registro de extravio encontrado na aba BD.")

    df['Resp']       = df['Resp'].fillna('').astype(str).str.strip().str.upper()
    df['SUPERVISOR'] = df['SUPERVISOR'].fillna('').astype(str).str.strip().str.upper()
    df['Regional']   = df['Regional'].fillna('').astype(str).str.strip()
    df['Motivo PT']  = df['Motivo PT'].fillna('Não informado').astype(str).str.strip()
    df['week']       = df['week'].fillna('').astype(str).str.strip()
    df['mês']        = df['mês'].fillna('').astype(str).str.strip()
    df['valor']      = pd.to_numeric(df['Uploaded Declared Value'], errors='coerce').fillna(0)
    df['is_lost']    = df['Reason'].astype(str).str.contains('Lost', case=False)

    # Data ref = data máxima válida
    try:
        data_ref = pd.to_datetime(df['Date'], errors='coerce').dropna().max().date().isoformat()
    except Exception:
        data_ref = ''

    total       = len(df)
    valor_total = round(float(df['valor'].sum()), 2)

    # ── Por DS ──────────────────────────────────────────
    grp_ds = (
        df.groupby(['Resp', 'SUPERVISOR', 'Regional'], dropna=False)
        .agg(total=('Waybill', 'count'), valor_total=('valor', 'sum'), total_lost=('is_lost', 'sum'))
        .reset_index()
    )
    por_ds = sorted([
        {
            'ds':            r['Resp'],
            'supervisor':    r['SUPERVISOR'],
            'regional':      r['Regional'],
            'total':         int(r['total']),
            'valor_total':   round(float(r['valor_total']), 2),
            'total_lost':    int(r['total_lost']),
            'total_damaged': int(r['total']) - int(r['total_lost']),
        }
        for _, r in grp_ds.iterrows()
        if r['Resp']
    ], key=lambda x: x['total'], reverse=True)

    # ── Por Motivo ───────────────────────────────────────
    grp_mot = (
        df.groupby('Motivo PT', dropna=False)
        .agg(total=('Waybill', 'count'), valor_total=('valor', 'sum'))
        .reset_index()
    )
    por_motivo = sorted([
        {
            'motivo':      r['Motivo PT'],
            'total':       int(r['total']),
            'valor_total': round(float(r['valor_total']), 2),
        }
        for _, r in grp_mot.iterrows()
        if r['Motivo PT']
    ], key=lambda x: x['total'], reverse=True)

    # ── Por Semana ──────────────────────────────────────
    grp_sem = (
        df.groupby(['week', 'mês'], dropna=False)
        .agg(total=('Waybill', 'count'), valor_total=('valor', 'sum'))
        .reset_index()
    )
    por_semana = sorted([
        {
            'semana':      r['week'],
            'mes':         r['mês'],
            'total':       int(r['total']),
            'valor_total': round(float(r['valor_total']), 2),
        }
        for _, r in grp_sem.iterrows()
        if r['week']
    ], key=lambda x: x['semana'])

    return {
        'total':       total,
        'valor_total': valor_total,
        'data_ref':    data_ref,
        'por_ds':      por_ds,
        'por_motivo':  por_motivo,
        'por_semana':  por_semana,
    }


@router.post("/processar")
@limiter.limit("10/minute")
async def processar_extravios(
    request: Request,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conteudo  = await validar_arquivo(file)
    resultado = _processar(conteudo)

    # Remove upload anterior da mesma data_ref
    existing = db.execute(
        text("SELECT id FROM extravios_uploads WHERE data_ref = :dr"),
        {"dr": resultado['data_ref']}
    ).mappings().first()
    if existing:
        old_id = existing["id"]
        for tbl in ("extravios_por_ds", "extravios_por_motivo", "extravios_por_semana"):
            try:
                db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": old_id})
            except Exception:
                pass
        db.execute(text("DELETE FROM extravios_uploads WHERE id = :id"), {"id": old_id})
        db.commit()

    row = db.execute(
        text("""
            INSERT INTO extravios_uploads (data_ref, criado_por, total, valor_total)
            VALUES (:data_ref, :criado_por, :total, :valor_total)
            RETURNING id
        """),
        {
            "data_ref":    resultado['data_ref'],
            "criado_por":  user["email"],
            "total":       resultado['total'],
            "valor_total": resultado['valor_total'],
        }
    ).mappings().first()
    uid = row["id"]
    db.commit()

    if resultado['por_ds']:
        rows = [{"upload_id": uid, **r} for r in resultado['por_ds']]
        for i in range(0, len(rows), 1000):
            db.execute(
                text("""
                    INSERT INTO extravios_por_ds (upload_id, ds, supervisor, regional, total, valor_total, total_lost, total_damaged)
                    VALUES (:upload_id, :ds, :supervisor, :regional, :total, :valor_total, :total_lost, :total_damaged)
                """),
                rows[i:i+1000]
            )
        db.commit()

    if resultado['por_motivo']:
        db.execute(
            text("INSERT INTO extravios_por_motivo (upload_id, motivo, total, valor_total) VALUES (:upload_id, :motivo, :total, :valor_total)"),
            [{"upload_id": uid, **r} for r in resultado['por_motivo']]
        )
        db.commit()

    if resultado['por_semana']:
        db.execute(
            text("INSERT INTO extravios_por_semana (upload_id, semana, mes, total, valor_total) VALUES (:upload_id, :semana, :mes, :total, :valor_total)"),
            [{"upload_id": uid, **r} for r in resultado['por_semana']]
        )
        db.commit()

    audit_log("upload_processado", f"extravios_uploads:{uid}", {"total": resultado['total']}, user)
    return {"upload_id": uid, "total": resultado['total'], "data_ref": resultado['data_ref']}


@router.delete("/upload/{upload_id}")
def deletar_upload(upload_id: int, user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    for tbl in ("extravios_por_ds", "extravios_por_motivo", "extravios_por_semana"):
        try:
            db.execute(text(f"DELETE FROM {tbl} WHERE upload_id = :id"), {"id": upload_id})
        except Exception:
            raise HTTPException(500, f"Erro ao deletar {tbl}")
    db.execute(text("DELETE FROM extravios_uploads WHERE id = :id"), {"id": upload_id})
    db.commit()
    audit_log("upload_deletado", f"extravios_uploads:{upload_id}", {}, user)
    return {"ok": True}
