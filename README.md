# wx-trace

compare.py - 处理原始trace日志和快照数据（可选）

index.js - 计算性能指标，并保存成xlsx

**目录格式（example)**

|-- case_1556107032777

 &ensp; &ensp; &ensp; &ensp;|-- screencap # 关键帧

 &ensp; &ensp; &ensp; &ensp;|-- screenRaw # 原始帧

 &ensp; &ensp; &ensp; &ensp;|-- screencap.json

 &ensp; &ensp; &ensp; &ensp;|-- trace_api.json

 &ensp; &ensp; &ensp; &ensp;|-- trace_hardware.json

 &ensp; &ensp; &ensp; &ensp;|-- trace_native.json

 &ensp; &ensp; &ensp; &ensp;|-- trace_page.json

|-- case_1557834456374

|-- case.json # 保存case的list

