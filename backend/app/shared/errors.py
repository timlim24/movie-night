"""Domain exceptions. Services raise these; main.py maps them to HTTP status codes in one place."""


class DomainError(Exception):
    status = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFound(DomainError):
    status = 404


class Forbidden(DomainError):
    status = 403


class Conflict(DomainError):
    status = 409


class UpstreamError(DomainError):
    status = 502
