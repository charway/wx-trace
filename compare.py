#!/usr/bin/env python

import sys
import os
import json
import copy
import functools
from shutil import copyfile, rmtree
from urllib import parse

from scipy.misc import imread,imsave
from scipy.linalg import norm
from scipy import sum, average

import numpy as np

destDir = './web/src/assets/'
destTraceLogDir = './web/traceLog/'
screencapDir = './screencap/'
traceLogDir = './traceLog/'
startUpTime = 0

def groupTraceReverse(data):
    traceLen = len(data)
    res = []
    last = None
    for i in range(traceLen-1, -1, -1):
        cur = data[i]
        if cur['cat'] == 'API':
            res.insert(0, cur)
            continue
        if last is None:
            last = cur
            continue
        if cur['start'] >= last['start'] and cur['end'] <= last['end']:
            if 'children' in last:
                last['children'].insert(0, cur)
            else:
                last['children'] = [cur]
        else:
            if 'children' in last:
                last['children'] = groupTraceReverse(copy.deepcopy(last['children']))
            res.insert(0, last)
            last = cur
    if len(res) == 0 or (last is not None and res[-1]['name'] != last['name']):
        if 'children' in last:
            last['children'] = groupTraceReverse(copy.deepcopy(last['children']))
        res.insert(0, last)
    return res

def filterFunc(e):
    return (e['cat'] == 'API' and \
            e['name'] != 'wx.onCompassChange' and \
            e['name'] != 'wx.onAccelerometerChange') or \
            (e['cat'].find('pages') != -1 and e['ph'] != 'B') or \
            e['cat'] == 'Hardware' or \
            e['cat'] == 'App' or \
            e['cat'] == 'Native'
            
def filterAPIFunc(e):
    return e['cat'] == 'API' and \
            e['name'] != 'wx.onCompassChange' and \
            e['name'] != 'wx.onAccelerometerChange'

def filterHardwareFunc(e):
    return e['cat'] == 'Hardware'

def filterNativeFunc(e):
    return e['cat'] == 'Native'

def filterPageFunc(e):
    return (e['cat'].find('pages') != -1 and e['ph'] != 'B') or \
            e['cat'] == 'App'

def filterCmp(x, y):
    if x['start'] != y['start']:
        return x['start'] - y['start']
    elif x['dur'] != y['dur']:
        return y['dur']- x['dur']
    else:
        return x['id'] - y['id']

def dealTrace():
    global destDir,startUpTime
    traceJson = {}
    traceList = []
    files = os.listdir(traceLogDir)
    ts = None
    for file_name in files:
        file = open(traceLogDir+file_name, 'r')
        ts_str = file_name.split('_')[-1]
        ts = ts_str
        id = 0
        try:
            while True:
                text_line = file.readline()
                if text_line:
                    items = text_line.split(',')
                    args = None
                    args_str = parse.unquote(items[5])
                    try:
                        args = json.loads(args_str)
                    except:
                        args = args_str
                    item = {
                        'id': id,
                        'name': items[0],
                        'cat': items[1],
                        'ph': items[2],
                        'ts': int(items[3]),
                        'start': int(ts) + int(items[3]),
                        'dur': (int(items[4]) - int(items[3])),
                        'end': int(ts) + int(items[4]),
                        'args': args
                    }
                    if item['name'] == 'startupDone':
                         # print(item['start'],item['end'])
                         startUpTime = item['end']
                    id += 1
                    traceList.append(item)
                else:
                    break
        finally:
            destDir += 'case_'+ ts +'/'
            if os.path.exists(destDir):
                rmtree(destDir)
            os.mkdir(destDir)
            file.close()
            copyfile(traceLogDir+file_name, destTraceLogDir+file_name)
        break
    filterFuncs={
            'api': filterAPIFunc, 
            'hardware': filterHardwareFunc, 
            'native': filterNativeFunc,
            'page': filterPageFunc
    }
   
    for filterFunc in filterFuncs:
        filterList = list(filter(filterFuncs[filterFunc], traceList))
        groupList = groupTraceReverse(list(filterList))
        sortedList = sorted(groupList, key=functools.cmp_to_key(filterCmp))
        traceJson['data'] = sortedList
        traceJson['ts'] = ts
        with open(destDir+"trace_"+filterFunc+".json", "w") as f:
            json.dump(traceJson, f)
    print('trace log done.')
    return ts

if __name__ == "__main__":
    dealTrace()
    
