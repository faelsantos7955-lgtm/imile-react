"""
api/limiter.py — Rate limiter compartilhado (slowapi)
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
