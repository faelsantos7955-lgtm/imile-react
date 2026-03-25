"""
api/routes/auth.py — Login, registro e perfil
"""
from fastapi import APIRouter, HTTPException, Depends, Response, Cookie
from pydantic import BaseModel
from api.deps import get_supabase, get_current_user

router = APIRouter()

_COOKIE_OPTS = dict(
    key="refresh_token",
    httponly=True,
    secure=True,
    samesite="lax",
    max_age=60 * 60 * 24 * 30,  # 30 dias
    path="/api/auth/refresh",
)


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    nome: str
    email: str
    motivo: str = ""


def _buscar_perfil(sb, user_id: str, email: str):
    """Busca o perfil do usuário na tabela usuarios."""
    perfil = sb.table("usuarios").select("*").eq("id", user_id).execute()
    if not perfil.data:
        perfil = sb.table("usuarios").select("*").eq("email", email).execute()
    return perfil.data[0] if perfil.data else None


@router.post("/login")
def login(req: LoginRequest, response: Response):
    sb = get_supabase()
    try:
        res = sb.auth.sign_in_with_password({
            "email": req.email.strip(),
            "password": req.password,
        })
        if not res.user:
            raise HTTPException(400, "Credenciais inválidas")

        p = _buscar_perfil(sb, str(res.user.id), res.user.email)
        if not p:
            raise HTTPException(403, "Usuário sem perfil no portal")
        if not p.get("ativo", True):
            raise HTTPException(403, "Conta desativada")

        # Refresh token em HttpOnly cookie — não exposto ao JS
        response.set_cookie(value=res.session.refresh_token, **_COOKIE_OPTS)

        return {
            "access_token": res.session.access_token,
            "user": {
                "id":      str(res.user.id),
                "email":   res.user.email,
                "nome":    p.get("nome", ""),
                "role":    p.get("role", "viewer"),
                "bases":   p.get("bases") or [],
                "paginas": p.get("paginas") or [],
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e).lower()
        if "invalid" in msg or "credentials" in msg:
            raise HTTPException(401, "Email ou senha incorretos")
        raise HTTPException(500, "Erro interno ao realizar login")


@router.post("/refresh")
def refresh(response: Response, refresh_token: str = Cookie(None)):
    if not refresh_token:
        raise HTTPException(401, "Sessão expirada — faça login novamente")
    sb = get_supabase()
    try:
        res = sb.auth.refresh_session(refresh_token)
        if not res.session:
            raise HTTPException(401, "Sessão inválida ou expirada")

        # Renova o cookie com novo refresh_token
        response.set_cookie(value=res.session.refresh_token, **_COOKIE_OPTS)

        return {"access_token": res.session.access_token}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Refresh token inválido ou expirado")


@router.post("/register")
def register(req: RegisterRequest):
    sb = get_supabase()
    try:
        sb.table("solicitacoes_acesso").insert({
            "nome":   req.nome.strip(),
            "email":  req.email.strip().lower(),
            "motivo": req.motivo.strip(),
            "status": "pendente",
        }).execute()
        return {"ok": True, "message": "Solicitação enviada"}
    except Exception:
        raise HTTPException(500, "Erro interno ao enviar solicitação")


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("refresh_token", path="/api/auth/refresh")
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user
