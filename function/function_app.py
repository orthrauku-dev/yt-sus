import azure.functions as func
import datetime
import json
import logging
import os
from azure.data.tables import TableServiceClient, UpdateMode
from azure.identity import DefaultAzureCredential
from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError

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

@app.route(route="flagged_channels", auth_level=func.AuthLevel.ANONYMOUS, methods=["GET", "OPTIONS"])
def flagged_channels(req: func.HttpRequest) -> func.HttpResponse:
    """
    Get all flagged AI YouTubers with vote counts.
    Returns a simple object with channel IDs as keys for easy lookup in the extension.
    
    Example response:
    {
        "UCxxxxxxxxxxxx": {
            "channelName": "AI Channel Name",
            "flaggedDate": "2025-11-17T12:00:00Z",
            "reason": "AI Content",
            "votes": 15
        }
    }
    """
    # Handle CORS preflight
    if req.method == "OPTIONS":
        return func.HttpResponse(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        )
    
    logging.info('Flagged channels API called')
    
    try:
        table_client = get_table_client('ytsustable')
        
        # Query all entities with PartitionKey = "channels"
        all_entities = table_client.query_entities(query_filter="PartitionKey eq 'channels'")
        
        # Convert to the format expected by the extension
        flagged_channels_dict = {}
        
        for entity in all_entities:
            # Only include if Flagged is true
            if entity.get('Flagged', False):
                channel_id = entity.get('RowKey')
                if channel_id:
                    flagged_channels_dict[channel_id] = {
                        'channelName': entity.get('ChannelName', 'Unknown'),
                        'flaggedDate': entity.get('FlaggedDate', ''),
                        'reason': entity.get('Reason', 'AI Content'),
                        'votes': entity.get('VoteCount', 0)
                    }
        
        logging.info(f"Returning {len(flagged_channels_dict)} flagged channels")
        
        return func.HttpResponse(
            json.dumps(flagged_channels_dict, default=str),
            mimetype="application/json",
            headers={
                "Access-Control-Allow-Origin": "*",  # Enable CORS for extension
                "Access-Control-Allow-Methods": "GET",
                "Cache-Control": "public, max-age=300"  # Cache for 5 minutes
            },
            status_code=200
        )
            
    except Exception as e:
        logging.error(f"Error reading flagged channels: {str(e)}")
        return func.HttpResponse(
            json.dumps({
                "error": str(e),
                "type": type(e).__name__
            }),
            mimetype="application/json",
            status_code=500
        )

@app.route(route="check_channel", auth_level=func.AuthLevel.ANONYMOUS, methods=["GET", "OPTIONS"])
def check_channel(req: func.HttpRequest) -> func.HttpResponse:
    """
    Check if a specific channel is flagged.
    Usage: /api/check_channel?channelId=UCxxxxxxxxxxxx
    
    Returns:
    {
        "flagged": true/false,
        "votes": 123,
        "details": {...} (if flagged)
    }
    """
    # Handle CORS preflight
    if req.method == "OPTIONS":
        return func.HttpResponse(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        )
    
    logging.info('Check channel API called')
    
    channel_id = req.params.get('channelId')
    if not channel_id:
        return func.HttpResponse(
            json.dumps({"error": "channelId parameter is required"}),
            mimetype="application/json",
            headers={"Access-Control-Allow-Origin": "*"},
            status_code=400
        )
    
    try:
        table_client = get_table_client('ytsustable')
        
        # Try to get the channel entity
        flagged = False
        details = {}
        votes = 0
        
        try:
            entity = table_client.get_entity(partition_key='channels', row_key=channel_id)
            flagged = entity.get('Flagged', False)
            votes = entity.get('VoteCount', 0)
            if flagged:
                details = {
                    "channelName": entity.get('ChannelName', 'Unknown'),
                    "flaggedDate": entity.get('FlaggedDate', ''),
                    "reason": entity.get('Reason', 'AI Content')
                }
        except Exception:
            # Channel not found = not flagged
            pass
        
        return func.HttpResponse(
            json.dumps({
                "flagged": flagged,
                "channelId": channel_id,
                "votes": votes,
                "details": details if flagged else None
            }, default=str),
            mimetype="application/json",
            headers={"Access-Control-Allow-Origin": "*"},
            status_code=200
        )
            
    except Exception as e:
        logging.error(f"Error checking channel: {str(e)}")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            headers={"Access-Control-Allow-Origin": "*"},
            status_code=500
        )

@app.route(route="vote_channel", auth_level=func.AuthLevel.ANONYMOUS, methods=["POST", "OPTIONS"])
def vote_channel(req: func.HttpRequest) -> func.HttpResponse:
    """
    Vote for a channel as AI content.
    Usage: POST /api/vote_channel with JSON body: {"channelId": "UCxxxx", "channelName": "Optional Name"}
    
    Returns:
    {
        "success": true,
        "votes": 124
    }
    """
    # Handle CORS preflight
    if req.method == "OPTIONS":
        return func.HttpResponse(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            }
        )
    
    logging.info('Vote channel API called')
    
    try:
        req_body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON body"}),
            mimetype="application/json",
            status_code=400
        )
    
    channel_id = req_body.get('channelId')
    channel_name = req_body.get('channelName', 'Unknown')
    
    if not channel_id:
        return func.HttpResponse(
            json.dumps({"error": "channelId is required"}),
            mimetype="application/json",
            status_code=400
        )
    
    try:
        table_client = get_table_client('ytsustable')
        
        # Try to get existing channel entity first
        try:
            entity = table_client.get_entity(partition_key='channels', row_key=channel_id)
            
            # Entity exists - increment vote count
            current_votes = entity.get('VoteCount', 0)
            entity['VoteCount'] = current_votes + 1
            entity['LastVoted'] = datetime.datetime.utcnow().isoformat() + 'Z'
            
            # Update channel name if not set
            if not entity.get('ChannelName') or entity.get('ChannelName') == 'Unknown':
                entity['ChannelName'] = channel_name
            
            # Use MERGE mode to only update changed fields
            table_client.update_entity(entity, mode=UpdateMode.MERGE)
            new_votes = current_votes + 1
            
            logging.info(f"Updated channel {channel_id}, new count: {new_votes}")
            
        except (ResourceNotFoundError, Exception) as get_error:
            # Entity doesn't exist - create new one with 1 vote
            logging.info(f"Channel {channel_id} not found, creating new entity: {str(get_error)}")
            
            try:
                entity = {
                    'PartitionKey': 'channels',
                    'RowKey': channel_id,
                    'VoteCount': 1,
                    'ChannelName': channel_name,
                    'Flagged': False,  # Not flagged by default, needs manual review
                    'FirstVoted': datetime.datetime.utcnow().isoformat() + 'Z',
                    'LastVoted': datetime.datetime.utcnow().isoformat() + 'Z',
                    'Reason': 'Community Reported AI Content'
                }
                
                table_client.create_entity(entity)
                new_votes = 1
                
                logging.info(f"Created channel {channel_id} with 1 vote")
            except ResourceExistsError:
                # Race condition - entity was created between get and create
                # Retry the get and update
                logging.info(f"Race condition detected for {channel_id}, retrying...")
                entity = table_client.get_entity(partition_key='channels', row_key=channel_id)
                current_votes = entity.get('VoteCount', 0)
                entity['VoteCount'] = current_votes + 1
                entity['LastVoted'] = datetime.datetime.utcnow().isoformat() + 'Z'
                table_client.update_entity(entity, mode=UpdateMode.MERGE)
                new_votes = current_votes + 1
                logging.info(f"Retried and updated channel {channel_id}, new count: {new_votes}")
        
        return func.HttpResponse(
            json.dumps({
                "success": True,
                "channelId": channel_id,
                "votes": new_votes
            }),
            mimetype="application/json",
            headers={"Access-Control-Allow-Origin": "*"},
            status_code=200
        )
            
    except Exception as e:
        logging.error(f"Error voting for channel: {str(e)}")
        logging.error(f"Error type: {type(e).__name__}")
        return func.HttpResponse(
            json.dumps({
                "error": str(e),
                "type": type(e).__name__
            }),
            mimetype="application/json",
            headers={"Access-Control-Allow-Origin": "*"},
            status_code=500
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