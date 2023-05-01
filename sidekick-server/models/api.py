from models.models import (
    Connection,
    ConnectorId,
    ConnectorStatus,
    AuthorizationResult
)
from pydantic import BaseModel
from typing import List, Optional, Dict

class ConnectorStatusResponse(BaseModel):
    status: ConnectorStatus

class ConnectorStatusRequest(BaseModel):
    connector_id: ConnectorId


class EnableConnectorRequest(BaseModel):
    connector_id: ConnectorId
    credential: Dict

class AuthorizeOauthRequest(BaseModel):
    connector_id: ConnectorId
    connection_id: str
    auth_code: Optional[str]


class AuthorizationResponse(BaseModel):
    result: AuthorizationResult


