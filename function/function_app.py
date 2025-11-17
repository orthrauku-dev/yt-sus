import azure.functions as func
import datetime
import json
import logging
import os
from azure.data.tables import TableServiceClient
from azure.identity import DefaultAzureCredential

app = func.FunctionApp()

# Initialize Table Service Client using Managed Identity
def get_table_client(table_name: str):
    # Use the storage account name from your info: ytsusbb09
    storage_account_name = os.environ.get("STORAGE_ACCOUNT_NAME", "ytsusstr")
    account_url = f"https://{storage_account_name}.table.core.windows.net/"
    
    logging.info(f"Connecting to storage account: {storage_account_name}")
    logging.info(f"Table URL: {account_url}")
    logging.info(f"Table name: {table_name}")
    
    # Use DefaultAzureCredential for managed identity authentication
    # This will try multiple auth methods: environment vars, managed identity, Azure CLI, etc.
    credential = DefaultAzureCredential(exclude_interactive_browser_credential=False)
    
    table_service_client = TableServiceClient(endpoint=account_url, credential=credential)
    return table_service_client.get_table_client(table_name)

@app.route(route="http_trigger", auth_level=func.AuthLevel.ANONYMOUS)
def http_trigger(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Python HTTP trigger function processed a request.')

    name = req.params.get('name')
    if not name:
        try:
            req_body = req.get_json()
        except ValueError:
            pass
        else:
            name = req_body.get('name')

    if name:
        return func.HttpResponse(f"Hello, {name}. This HTTP triggered function executed successfully.")
    else:
        return func.HttpResponse(
             "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.",
             status_code=200
        )

@app.route(route="table_read", auth_level=func.AuthLevel.ANONYMOUS, methods=["GET"])
def table_read(req: func.HttpRequest) -> func.HttpResponse:
    logging.info('Table read function triggered.')
    
    try:
        # Get table name from query parameters (default to ytsustable)
        table_name = req.params.get('table', 'ytsustable')
        
        # Get optional filters
        partition_key = req.params.get('partitionKey')
        row_key = req.params.get('rowKey')
        
        logging.info(f"Reading from table: {table_name}")
        table_client = get_table_client(table_name)
        
        # If both partition and row key are provided, get a specific entity
        if partition_key and row_key:
            logging.info(f"Getting entity: PK={partition_key}, RK={row_key}")
            entity = table_client.get_entity(partition_key=partition_key, row_key=row_key)
            return func.HttpResponse(
                json.dumps(dict(entity), default=str),
                mimetype="application/json",
                status_code=200
            )
        
        # If only partition key is provided, query by partition
        elif partition_key:
            logging.info(f"Querying partition: {partition_key}")
            entities = table_client.query_entities(f"PartitionKey eq '{partition_key}'")
            results = [dict(entity) for entity in entities]
            return func.HttpResponse(
                json.dumps(results, default=str),
                mimetype="application/json",
                status_code=200
            )
        
        # Otherwise, list all entities (with a limit to avoid large responses)
        else:
            logging.info("Listing all entities (max 100)")
            entities = table_client.list_entities(results_per_page=100)
            results = [dict(entity) for entity in entities.by_page().next()]
            logging.info(f"Found {len(results)} entities")
            return func.HttpResponse(
                json.dumps({
                    "count": len(results),
                    "entities": results
                }, default=str),
                mimetype="application/json",
                status_code=200
            )
            
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logging.error(f"Error reading from table: {str(e)}")
        logging.error(f"Full traceback:\n{error_details}")
        return func.HttpResponse(
            json.dumps({
                "error": str(e),
                "type": type(e).__name__,
                "details": error_details
            }),
            mimetype="application/json",
            status_code=500
        )