import uuid
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


def _error_body(code: str, message: str, request_id: str, fields: dict | None = None) -> dict:
    body: dict = {"error": {"code": code, "message": message}, "request_id": request_id}
    if fields:
        body["error"]["fields"] = fields
    return body


def register_exception_handlers(app: FastAPI) -> None:
    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        rid = getattr(request.state, "request_id", "")
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body("HTTP_ERROR", str(exc.detail), rid),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        rid = getattr(request.state, "request_id", "")
        fields = {".".join(str(loc) for loc in e["loc"]): e["msg"] for e in exc.errors()}
        return JSONResponse(
            status_code=422,
            content=_error_body("VALIDATION_ERROR", "Input validation failed", rid, fields),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        rid = getattr(request.state, "request_id", "")
        # Internal database exceptions and unexpected errors never leak to clients
        return JSONResponse(
            status_code=500,
            content=_error_body("INTERNAL_SERVER_ERROR", "An unexpected internal server error occurred.", rid),
        )
