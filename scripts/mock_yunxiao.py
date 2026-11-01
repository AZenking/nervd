"""云效 OpenAPI mock：只实现工时验收需要的两个端点，按官方契约校验请求。

契约依据：
- POST /oapi/v1/projex/organizations/{org}/workitems （CreateWorkitem）
- POST /oapi/v1/projex/organizations/{org}/workitems/{id}/estimatedEfforts
  （CreateEstimatedEffort，body 字段 spentTime，https://help.aliyun.com/zh/yunxiao/developer-reference/createestimatedeffort）

确定性：响应不含时间戳；相同请求序列 → 相同响应与记录文件。
"""
import hashlib
import json
import sys
from pathlib import Path

from flask import Flask, jsonify, request

app = Flask(__name__)
RECORDED: list[dict] = []
RECORD_FILE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/tmp/nervd-e2e/recorded.json')


def check_auth():
    if request.headers.get('x-yunxiao-token', '').strip() == '':
        return jsonify(errorCode='Unauthorized', errorMessage='missing token'), 401
    return None


@app.post('/oapi/v1/projex/organizations/<org>/workitems')
def create_workitem(org):
    if (err := check_auth()) is not None:
        return err
    body = request.get_json(force=True)
    # 工时是受控字段：创建接口里出现工时字段即契约违规（真实云效会静默丢弃）
    illegal = [k for k in ('spentTime', 'estimatedHours', 'estimatedTime') if k in body]
    # id 由请求内容派生：相同请求序列 → 相同响应（重跑可比对）
    wid = 'wi-' + hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:8]
    RECORDED.append({'kind': 'create', 'org': org, 'illegalEffortFields': illegal, 'subject': body.get('subject')})
    RECORD_FILE.write_text(json.dumps(RECORDED, ensure_ascii=False, indent=2) + '\n')
    return jsonify(id=wid, identifier='TASK-E2E', subject=body.get('subject'),
                   categoryId='Task', status={'id': 'st-1', 'name': '待办'})


@app.post('/oapi/v1/projex/organizations/<org>/workitems/<wid>/estimatedEfforts')
def estimated_effort(org, wid):
    if (err := check_auth()) is not None:
        return err
    body = request.get_json(force=True)
    # 契约：字段名必须是 spentTime（number）；estimatedHours/estimatedTime 均为错误字段名
    if 'spentTime' not in body or not isinstance(body['spentTime'], (int, float)):
        return jsonify(errorCode='InvalidParameter',
                       errorMessage='spentTime (number) required'), 400
    RECORDED.append({'kind': 'effort', 'org': org, 'workitemId': wid, 'spentTime': body['spentTime']})
    RECORD_FILE.write_text(json.dumps(RECORDED, ensure_ascii=False, indent=2) + '\n')
    return jsonify(workitemId=wid, spentTime=body['spentTime'])


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=8765)
