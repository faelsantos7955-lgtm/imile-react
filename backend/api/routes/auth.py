"""
api/routes/auth.py — Login, registro e perfil
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from api.deps import get_supabase, get_current_user

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class RegisterRequest(BaseModel):
    nome: str
    email: str
    motivo: str = ""


@router.post("/login")
def login(req: LoginRequest):
    sb = get_supabase()
    try:
        res = sb.auth.sign_in_with_password({
            "email": req.email.strip(),
            "password": req.password,
        })
        if not res.user:
            raise HTTPException(400, "Credenciais inválidas")

        # Busca perfil
        perfil = sb.table("usuarios").select("*").eq("id", str(res.user.id)).execute()
        if not perfil.data:
            perfil = sb.table("usuarios").select("*").eq("email", res.user.email).execute()

        if not perfil.data:
            raise HTTPException(403, "Usuário sem perfil no portal")

        p = perfil.data[0]
        if not p.get("ativo", True):
            raise HTTPException(403, "Conta desativada")

        return {
            "access_token": res.session.access_token,
            "refresh_token": res.session.refresh_token,
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
def refresh(req: RefreshRequest):
    sb = get_supabase()
    try:
        res = sb.auth.refresh_session(req.refresh_token)
        if not res.session:
            raise HTTPException(401, "Refresh token inválido ou expirado")
        return {
            "access_token":  res.session.access_token,
            "refresh_token": res.session.refresh_token,
        }
    except HTTPException:
        raise
    except Exception as e:
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


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user


@router.post("/logout")
def logout():
    # Stateless — frontend apaga o token
    return {"ok": True}
