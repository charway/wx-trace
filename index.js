const fs = require('fs')
const speedIndexCli = require('./speedIndex/cli')
const Excel = require('exceljs')
const base = './web/src/assets'

const filterArr = (arr, startTs, endTs) => {
    let res = []
    for (let i = 0; i < arr.length; i += 1) {
        if (arr[i].start < startTs) {
            continue
        }
        if (endTs !== -1 && arr[i].start > endTs) {
            break
        }
        res.push(arr[i])
    }
    return res
}

const buffer2Json = buffer => {
    const bufferString = Buffer.from(buffer).toString()
    return JSON.parse(bufferString)
}

const searchMetricsReport = file => {
    try {
        const trace_api = fs.readFileSync(file)
        const arr = buffer2Json(trace_api).data
        const typeList = [
            'wxapp.app.load',
            'wxapp.page.ready',
            'wxapp.page.fmp.time',
            'wxapp.page.fmp.dataSize',
            'wxapp.data.time',
            'wxapp.speed.custom',
            'wxapp.page.dataSize'
        ]
        const res = {}
        for (let i = 0; i < arr.length; i += 1) {
            const args = arr[i].args ? arr[i].args.args : null
            if (arr[i].name === 'wx.request' && args && args.url === 'https://dreport.meituan.net') {
                const len = args.data[0].logs.length
                if (len > 1) {
                    args.data[0].logs.forEach(e => {
                        // 先过滤掉request
                        if (typeList.indexOf(e.type) !== -1) {
                            let key = e.type
                            const pgNameArr = e.tags.pageName.split('/')
                            const pgName = pgNameArr[pgNameArr.length - 1]
                            if (e.tags) {
                                if (e.tags.step) {
                                    key += `(${e.tags.step})`
                                } else if (e.tags.key) {
                                    key += `(${e.tags.key})`
                                }
                            }
                            if (!res[pgName]) {
                                res[pgName] = {}
                            }
                            res[pgName][key] = e.value
                        }
                    })
                }
            }
        }
        return res
    } catch (err) {
        return {}
    }
}

const getVersion = arr => {
    for (let i = 0; i < arr.length; i += 1) {
        const args = arr[i].args ? arr[i].args.args : null
        if (arr[i].name === 'wx.request' && args && args.url === 'https://report.meituan.com') {
            const app = args.data[0].app
            if (app) {
                return app
            }
        }
    }
}

const searchByName = (arr, target) => {
    for (let i = 0; i < arr.length; i += 1) {
        if (arr[i].name === target) {
            return arr[i]
        }
        if (arr[i].children) {
            const res = searchByName(arr[i].children, target)
            if (res) {
                return res
            }
        }
    }
    return null
}

const searchAllByName = (arr, target, res = []) => {
    for (let i = 0; i < arr.length; i += 1) {
        if (arr[i].name === target) {
            res.push(arr[i])
        }
        if (arr[i].children) {
            searchByName(arr[i].children, target, res)
        }
    }
    return res
}

const searchPageTs = (arr, res = []) => {
    for (let i = 0; i < arr.length; i += 1) {
        if (arr[i].name === 'PageLoad') {
            res.push(arr[i].start)
        }
        if (arr[i].children) {
            searchPageTs(arr[i].children, res)
        }
    }
    return res
}

const getPageTs = file => {
    const trace_native = fs.readFileSync(file)
    const trace_native_data = buffer2Json(trace_native).data
    const pageTsInfo = searchPageTs(trace_native_data, [])
    return pageTsInfo
}

const searchByBaseInfo = (arr, targets, res = {}) => {
    for (let i = 0; i < arr.length; i += 1) {
        if (targets.length === 0) {
            break
        }
        const targetIndex = targets.indexOf(arr[i].name)
        if (targetIndex !== -1) {
            res[targets[targetIndex]] = arr[i]
            targets.splice(targetIndex, 1)
        }
        if (arr[i].children) {
            searchByBaseInfo(arr[i].children, targets, res)
        }
    }
    return res
}

const calcSpeedIndex = (dir, startTs, endTs) => {
    const screencapDir = fs.readdirSync(dir)
    const timelineJson = []
    for (let i = 0; i < screencapDir.length; i += 1) {
        const filename = screencapDir[i]
        const ts = parseInt(filename.replace('.jpg', ''), 10)
        if (ts < startTs) {
            continue
        }
        if (endTs !== -1 && ts > endTs) {
            break
        }
        const imgData = fs.readFileSync(`${dir}/${filename}`)
        const snapshot = Buffer.from(imgData).toString('base64')
        timelineJson.push({
            ts,
            cat: 'disabled-by-default-devtools.screenshot',
            args: {
                snapshot
            }
        })
    }
    if (timelineJson.length === 0) {
        return {}
    }
    return speedIndexCli(timelineJson, { pretty: false, fast: true, include: 'speedIndex' })
}

const calcHardware = (file, startTs, endTs) => {
    const trace_hardware = fs.readFileSync(file)
    const trace_hardware_data = filterArr(buffer2Json(trace_hardware).data, startTs, endTs)
    const memoryDataArr = searchAllByName(trace_hardware_data, 'MEMORY')
    const memoryData = []
    let memoryTotal = 0,
        memoryCount = 0,
        memoryMax = 0
    for (e of memoryDataArr) {
        const data = JSON.parse(e.args.replace(/\+/g, ''))
        const m = parseInt(data['MEMORY'], 10)
        memoryTotal += m
        memoryCount += 1
        if (m > memoryMax) {
            memoryMax = m
        }
    }
    return {
        memoryAvg: Math.floor(memoryTotal / memoryCount),
        memoryMax
    }
}

const calcApi = (file, startTs, endTs) => {
    try {
        const trace_api = fs.readFileSync(file)
        const trace_api_data = buffer2Json(trace_api).data
        const requestArr = filterArr(searchAllByName(trace_api_data, 'wx.request'), startTs, endTs)
        const fstReqRec = requestArr[0].args.res.header['X-Android-Received-Millis'] // 首字节时间
        let requestCount = 0,
            queueTotal = 0,
            requestTotal = 0,
            requestMax = 0,
            ttlTotal = 0,
            ttlMax = 0,
            FstFreq = 0,
            SecFreq = 0

        const requestStartTs = requestArr[0].start
        for (let i = 0; i < requestArr.length; i += 1) {
            const e = requestArr[i]
            requestCount += 1
            const start = e.start
            const end = e.end
            const dur = e.dur
            requestTotal += dur
            if (dur > requestMax) {
                requestMax = dur
            }

            const send = parseInt(e.args.res.header['X-Android-Sent-Millis'], 10)
            const received = parseInt(e.args.res.header['X-Android-Received-Millis'], 10)

            const ttlDur = received - send
            queueTotal += send - start

            ttlTotal += ttlDur
            if (ttlDur > ttlMax) {
                ttlMax = ttlDur
            }
            const durTs = start - requestStartTs
            if (durTs < 1000) {
                FstFreq += 1
            }
            if (durTs > 1000 && durTs < 2000) {
                SecFreq += 1
            }
        }
        const version = getVersion(trace_api_data)
        return {
            version,
            requestAvg: Math.floor(requestTotal / requestCount),
            requestMax,
            ttlAvg: Math.floor(ttlTotal / requestCount),
            ttlMax,
            queueAvg: Math.floor(queueTotal / requestCount),
            fstReqRec,
            FstFreq,
            SecFreq
        }
    } catch (err) {
        return {}
    }
}

const calcNative = (file, startTs, endTs) => {
    const trace_native = fs.readFileSync(file)
    const native_targets = ['ResourcePrepare', 'ActivityCreate', 'PageLoad', 'startupDone']
    const trace_native_data = filterArr(buffer2Json(trace_native).data, startTs, endTs)
    const { ResourcePrepare = {}, ActivityCreate = {}, PageLoad = {}, startupDone = {} } = searchByBaseInfo(
        trace_native_data,
        native_targets
    )
    return {
        ResourcePrepare: ResourcePrepare.dur,
        ActivityCreate: ActivityCreate.dur,
        PageLoad: PageLoad.dur,
        startupDone: startupDone.dur,
        PageLoadTs: PageLoad.start
    }
}

const calcPage = (file, startTs, endTs) => {
    const trace_page = fs.readFileSync(file)
    const trace_page_data = filterArr(buffer2Json(trace_page).data, startTs, endTs)
    const targets = ['App.onLaunch', 'App.onShow', 'Page.onLoad', 'firstRender', 'Page.onShow', 'Page.onReady']
    const pageBaseInfo = searchByBaseInfo(trace_page_data, targets)
    let appLoad, pageReady, appLoadTs
    if (pageBaseInfo['App.onLaunch']) {
        appLoad = pageBaseInfo['Page.onLoad'].start - pageBaseInfo['App.onLaunch'].start
    }
    if (pageBaseInfo['Page.onLoad']) {
        pageReady = pageBaseInfo['Page.onReady'].start - pageBaseInfo['Page.onLoad'].start
    }
    if (pageBaseInfo['Page.onLoad']) {
        appLoadTs = pageBaseInfo['Page.onLoad'].start
    }
    return {
        pageName: pageBaseInfo['firstRender'].cat,
        appLoad,
        pageReady,
        appLoadTs,
        firstRender: pageBaseInfo['firstRender'].dur,
        firstRenderTs: pageBaseInfo['firstRender'].start
    }
}

;(async () => {
    const caseFile = fs.readFileSync(`${base}/case.json`)
    let i = 0
    const dataArr = {}
    const headerArr = {}

    const workbook = new Excel.Workbook()
    for (const e of buffer2Json(caseFile)) {
        const pageTs = getPageTs(`${base}/${e}/trace_native.json`)
        pageTs.push(-1)
        pageTs[0] = 0
        for (let i = 0; i < pageTs.length - 1; i += 1) {
            let rowData = []
            let startTs = pageTs[i]
            const endTs = pageTs[i + 1]
            const { PageLoadTs, ...nativeData } = calcNative(`${base}/${e}/trace_native.json`, startTs, endTs)
            const pageIndexData = await calcSpeedIndex(`${base}/${e}/screencapRaw`, startTs, endTs)
            const hardwareData = calcHardware(`${base}/${e}/trace_hardware.json`, startTs, endTs)
            const { firstRenderTs, appLoadTs, pageName, ...pageData } = calcPage(
                `${base}/${e}/trace_page.json`,
                startTs,
                endTs
            )
            const { version, fstReqRec, ...apiData } = calcApi(`${base}/${e}/trace_api.json`, startTs, endTs)
            const pgNameArr = pageName.split('/')
            const pgName = pgNameArr[pgNameArr.length - 1]
            const addHeader = head => {
                if (!headerArr[pgName]) {
                    headerArr[pgName] = []
                }
                const headerIndex = headerArr[pgName].indexOf(head)
                if (headerIndex === -1) {
                    headerArr[pgName].push(head)
                    return headerArr[pgName].length - 1
                }
                return headerIndex
            }

            const addRow = (data, arr) => {
                Object.keys(data).forEach(e => {
                    if (data[e]) {
                        const index = addHeader(e)
                        arr[index] = data[e]
                    }
                })
            }
            addRow({ version }, rowData)
            addRow({ speedIndex: pageIndexData.speedIndex }, rowData)
            addRow(nativeData, rowData)
            addRow({ fstReqRec: fstReqRec - appLoadTs }, rowData)
            addRow({ loadTime: firstRenderTs - PageLoadTs }, rowData)
            addRow(hardwareData, rowData)
            addRow(pageData, rowData)
            addRow(apiData, rowData)

            if (dataArr[pgName]) {
                dataArr[pgName].push(rowData)
            } else {
                dataArr[pgName] = [rowData]
            }
        }

        const metricData = searchMetricsReport(`${base}/${e}/trace_api.json`)
        Object.keys(metricData).forEach(pgName => {
            const d = metricData[pgName]
            Object.keys(d).forEach(e => {
                const headerIndex = headerArr[pgName].indexOf(e)
                let index = headerIndex
                if (headerIndex === -1) {
                    headerArr[pgName].push(e)
                    index = headerArr[pgName].length - 1
                }
                dataArr[pgName][dataArr[pgName].length - 1][index] = d[e]
            })
        })
    }
    Object.keys(dataArr).forEach(pgName => {
        const sheet = workbook.addWorksheet(pgName)
        sheet.addRow(headerArr[pgName])
        dataArr[pgName].forEach(e => {
            sheet.addRow(e)
        })
    })
    workbook.xlsx.writeFile('test.xlsx')
})()
