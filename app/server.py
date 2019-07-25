"""
http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
"""

import base64
import os

from flask import Flask, request, make_response
from key_server_common import ServerResponseBuilder
from key_cache import KeyCache
from key_generator import KeyGenerator

app = Flask(__name__)

BUCKET_NAME = os.environ["KEYSTORE_BUCKET"]
CLIENT_URL_PREFIX = os.environ["KEYSTORE_URL"]


def server_handler(event, context):
    """
    This function is the entry point for the SPEKE reference key
    server Lambda. This is invoked from the API Gateway resource.
    """
    try:
        print(event)
        body = event['body']
        if event['isBase64Encoded']:
            body = base64.b64decode(body)
        cache = KeyCache(BUCKET_NAME, CLIENT_URL_PREFIX)
        generator = KeyGenerator()
        response = ServerResponseBuilder(body, cache, generator).get_response()
        print(response)
        return response
    except Exception as exception:
        print("EXCEPTION {}".format(exception))
        return {"isBase64Encoded": False, "statusCode": 500, "headers": {"Content-Type": "text/plain"}, "body": str(exception)}

@app.route('/copyProtection', methods=['POST'])
def copy_protection():
    try:
        body = request.data
        print(body)
        cache = KeyCache(BUCKET_NAME, CLIENT_URL_PREFIX)
        generator = KeyGenerator()
        response = ServerResponseBuilder(body, cache, generator).get_response()
        print(response)
        return response['body']
    except Exception as exception:
        print("EXCEPTION {}".format(exception))
        return make_response(str(exception), 500)