from models.models import AppConfig, Document, ConnectorId, DataConnector, AuthorizationResult
from typing import List, Optional
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from appstatestore.statestore import StateStore
import os
import uuid
import json
import importlib
from typing import Any, Dict
import io 
from PyPDF2 import PdfReader
import re
from collections import deque


SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

def download_pdf(service, file_id):
    request = service.files().get_media(fileId=file_id)
    file = io.BytesIO(request.execute())
    return file

def extract_pdf_text(pdf_file):
    reader = PdfReader(pdf_file)
    text = ''
    for page_num in range(len(reader.pages)):
        text += reader.pages[page_num].extract_text()
    return text

class GoogleDriveConnector(DataConnector):
    connector_id: ConnectorId = ConnectorId.gdrive
    config: AppConfig

    def __init__(self, config: AppConfig):
        super().__init__(config=config)

    async def authorize_api_key(self) -> AuthorizationResult:
        pass              

    async def authorize(self, connection_id: str, auth_code: Optional[str], metadata: Dict) -> AuthorizationResult:
        client_secrets = StateStore().get_connector_credential(self.connector_id, self.config)

        flow = InstalledAppFlow.from_client_config(
            client_secrets,
            SCOPES, 
            redirect_uri="https://link.psychic.dev/oauth/redirect"
        )
        
        if not auth_code:
            auth_url, _ = flow.authorization_url(prompt='consent')
            return AuthorizationResult(authorized=False, auth_url=auth_url)
        
        flow.fetch_token(code=auth_code)
        # Build the Google Drive API client with the credentials
        creds = flow.credentials
        creds_string = creds.to_json()
        folder_url = metadata['folder_url']
        folder_id = get_id_from_url(folder_url)

        new_connection = StateStore().add_connection(
            config=self.config,
            credential=creds_string,
            connector_id=self.connector_id,
            connection_id=connection_id,
            metadata={
                'folder_id': folder_id,
            }
        )
        return AuthorizationResult(authorized=True, connection=new_connection)


    async def load(self, connection_id: str) -> List[Document]:
        # initialize credentials
        connection = StateStore().load_credentials(
            self.config, 
            self.connector_id,
            connection_id 
        )

        credential_string = connection.credential
        folder_id = connection.metadata['folder_id']

        credential_json = json.loads(credential_string)
        creds = Credentials.from_authorized_user_info(
            credential_json
        )

        if not creds.valid and creds.refresh_token:
            creds.refresh(Request())
            creds_string = creds.to_json()
            StateStore().add_connection(
                config=connection.config,
                credential=creds_string,
                connector_id=self.connector_id,
                connection_id=connection_id,
                metadata={
                    'folder_id': folder_id,
                }
            )
        service = build('drive', 'v3', credentials=creds)


        # List the files in the specified folder
        results = service.files().list(q=f"'{folder_id}' in parents and trashed = false",
                                    fields="nextPageToken, files(id, name, webViewLink)").execute()
        items = results.get('files', [])

        if len(items) == 0:
            raise Exception("Folder is empty")
        
        return get_documents_from_folder(service, folder_id)

def list_files_in_folder(service, folder_id):
    query = f"'{folder_id}' in parents"
    results = service.files().list(q=query, fields="nextPageToken, files(id, name, mimeType, webViewLink)").execute()
    items = results.get("files", [])
    return items

def get_documents_from_folder(service, folder_id) -> List[Document]:
    documents: List[Document] = []
    folders_to_process = deque([folder_id])

    while folders_to_process:
        current_folder = folders_to_process.popleft()
        items = list_files_in_folder(service, current_folder)

        for item in items:
            mime_type = item.get("mimeType", "")

            if mime_type == "application/vnd.google-apps.folder":
                folders_to_process.append(item["id"])
            elif mime_type in ["application/vnd.google-apps.document", "application/pdf"]:
                # Retrieve the full metadata for the file
                file_metadata = service.files().get(fileId=item["id"]).execute()
                mime_type = file_metadata.get("mimeType", "")

                if mime_type == "application/vnd.google-apps.document":
                    doc = service.files().export(fileId=item["id"], mimeType="text/plain").execute()
                    content = doc.decode("utf-8")
                elif mime_type == "application/pdf":
                    pdf_file = download_pdf(service, item["id"])
                    content = extract_pdf_text(pdf_file)

                documents.append(
                    Document(
                        title=item["name"],
                        content=content,
                        uri=item["webViewLink"],
                    )
                )
            else:
                print(f"Unsupported file type: {mime_type}")

    return documents

def get_id_from_folder_name(folder_name: str, service) -> str:
    print("loading documents")
    folder_query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    folder_result = service.files().list(q=folder_query, fields="nextPageToken, files(id)").execute()
    folder_items = folder_result.get('files', [])
    print("folder items:", folder_items)

    if len(folder_items) == 0:
        print(f"No folder named '{folder_name}' was found.")
        raise Exception(f"No folder named '{folder_name}' was found.")
    elif len(folder_items) > 1:
        print(f"Multiple folders named '{folder_name}' were found. Using the first one.")

    folder_id = folder_items[0]['id']
    return folder_id

def get_id_from_url(url: str):
    # Extract the folder ID from the link
    folder_id = re.search(r'folders/([\w-]+)', url)
    if folder_id:
        folder_id = folder_id.group(1)
        return folder_id
    else:
        raise Exception("Invalid Google Drive folder link.")
    
