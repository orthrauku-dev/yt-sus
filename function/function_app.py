import azure.functions as func
import datetime
import json
import logging
import os
import hashlib
from azure.data.tables import TableServiceClient, UpdateMode
from azure.identity import DefaultAzureCredential
from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError

app = func.FunctionApp()

# In-memory rate limiting (expires old entries automatically)
vote_rate_limit = {}  # Format: {ip_channel_hash: timestamp}
VOTE_COOLDOWN_HOURS = 24  # Same IP can't vote for same channel within 24 hours
MAX_VOTES_PER_IP_PER_HOUR = 10  # Prevent mass voting sprees

def cleanup_old_rate_limits():
    """Remove expired entries from rate limit dictionary"""
    now = datetime.datetime.utcnow()
    cutoff = now - datetime.timedelta(hours=VOTE_COOLDOWN_HOURS)
    
    # Remove entries older than cooldown period
    expired_keys = [k for k, v in vote_rate_limit.items() if v < cutoff]
    for key in expired_keys:
        del vote_rate_limit[key]
    
    if expired_keys:
        logging.info(f"Cleaned up {len(expired_keys)} expired rate limit entries")

def get_client_ip(req: func.HttpRequest) -> str:
    """Extract client IP from request, handling proxies"""
    # Try X-Forwarded-For first (for proxies/load balancers)
    forwarded_for = req.headers.get('X-Forwarded-For')
    if forwarded_for:
        # Take the first IP in the chain
        return forwarded_for.split(',')[0].strip()
    
    # Fall back to X-Client-IP or direct connection
    return req.headers.get('X-Client-IP') or req.headers.get('REMOTE_ADDR') or 'unknown'

def check_rate_limit(ip: str, channel_id: str) -> tuple[bool, str]:
    """
    Check if IP is rate limited for voting on this channel.
    Returns (is_allowed, reason)
    """
    cleanup_old_rate_limits()
    
    now = datetime.datetime.utcnow()
    
    # Check 1: Has this IP voted for this channel recently?
    ip_channel_key = f"{ip}:{channel_id}"
    
    if ip_channel_key in vote_rate_limit:
        last_vote = vote_rate_limit[ip_channel_key]
        hours_since = (now - last_vote).total_seconds() / 3600
        
        if hours_since < VOTE_COOLDOWN_HOURS:
            return False, f"Please wait {int(VOTE_COOLDOWN_HOURS - hours_since)} hours before voting for this channel again"
    
    # Check 2: Has this IP been voting too frequently overall?
    recent_votes = sum(1 for k, v in vote_rate_limit.items() 
                      if k.startswith(f"{ip}:") 
                      and (now - v).total_seconds() < 3600)
    
    if recent_votes >= MAX_VOTES_PER_IP_PER_HOUR:
        return False, "Too many votes in the last hour. Please slow down."
    
    return True, ""

def record_vote(ip: str, channel_id: str):
    """Record that this IP voted for this channel"""
    ip_channel_key = f"{ip}:{channel_id}"
    vote_rate_limit[ip_channel_key] = datetime.datetime.utcnow()

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
                "Access-Control-Allow-Headers": "Content-Type, X-Extension-Version, X-Extension-ID"
            }
        )
    
    logging.info('Vote channel API called')
    
    # Validate request is from the extension
    extension_version = req.headers.get('X-Extension-Version')
    extension_id = req.headers.get('X-Extension-ID')
    
    if not extension_version or not extension_id:
        logging.warning(f"Vote rejected: Missing extension headers")
        return func.HttpResponse(
            json.dumps({"error": "Invalid request source"}),
            mimetype="application/json",
            headers={"Access-Control-Allow-Origin": "*"},
            status_code=403
        )
    
    # Validate extension version (must be 1.0.0 or higher)
    try:
        version_parts = extension_version.split('.')
        major_version = int(version_parts[0])
        if major_version < 1:
            logging.warning(f"Vote rejected: Invalid extension version {extension_version}")
            return func.HttpResponse(
                json.dumps({"error": "Extension version not supported"}),
                mimetype="application/json",
                headers={"Access-Control-Allow-Origin": "*"},
                status_code=403
            )
    except (ValueError, IndexError):
        logging.warning(f"Vote rejected: Malformed extension version {extension_version}")
        return func.HttpResponse(
            json.dumps({"error": "Invalid extension version format"}),
            mimetype="application/json",
            headers={"Access-Control-Allow-Origin": "*"},
            status_code=403
        )
    
    logging.info(f"Request validated from extension v{extension_version}, ID: {extension_id}")
    
    # Get client IP for rate limiting
    client_ip = get_client_ip(req)
    logging.info(f"Request from IP: {client_ip}")
    
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
    
    # Check rate limit
    is_allowed, rate_limit_reason = check_rate_limit(client_ip, channel_id)
    if not is_allowed:
        logging.warning(f"Vote rejected for {channel_id} from {client_ip}: {rate_limit_reason}")
        return func.HttpResponse(
            json.dumps({
                "error": rate_limit_reason,
                "type": "rate_limit"
            }),
            mimetype="application/json",
            headers={"Access-Control-Allow-Origin": "*"},
            status_code=429  # Too Many Requests
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
        
        # Record the vote for rate limiting
        record_vote(client_ip, channel_id)
        
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
