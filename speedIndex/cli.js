#!/usr/bin/env node
'use strict'

var path = require('path')
// var meow = require('meow')
var babar = require('babar')
// var loudRejection = require('loud-rejection')

var speedIndex = require('.')

const OUTPUT_GREEN = '\x1b[32m'
const OUTPUT_BOLD = '\x1b[1m'
const OUTPUT_RESET = '\x1b[22m\x1b[39m'

/** @param {speedIndex.Output<'all'|'speedIndex'|'perceptualSpeedIndex'>} res */
function display(res) {
    const startTs = res.beginning
    const visualProgress = res.frames
        .map(frame => {
            const ts = Math.floor(frame.getTimeStamp() - startTs)
            return `${ts}=${Math.floor(frame.getProgress())}%`
        })
        .join(', ')

    const visualPreceptualProgress = res.frames
        .map(frame => {
            const ts = Math.floor(frame.getTimeStamp() - startTs)
            return `${ts}=${Math.floor(frame.getPerceptualProgress())}%`
        })
        .join(', ')

    // const log = [
    //     `First Visual Change: ${res.first}`,
    //     `Visually Complete: ${res.complete}`,
    //     '',
    //     `Speed Index: ${res.speedIndex.toFixed(1)}`,
    //     `Visual Progress: ${visualProgress}`,
    //     '',
    //     `Perceptual Speed Index: ${res.perceptualSpeedIndex.toFixed(1)}`,
    //     `Perceptual Visual Progress: ${visualPreceptualProgress}`
    // ].join(`\n`)
    // console.log(log)
    return {
        speedIndex: res.speedIndex.toFixed(2),
        perceptualSpeedIndex: res.perceptualSpeedIndex ? res.perceptualSpeedIndex.toFixed(2) : -1
    }
}

/** @param {speedIndex.Output<'all'>} res */
function displayPretty(res) {
    /** @param {string} content */
    const green = content => OUTPUT_GREEN + content + OUTPUT_RESET
    /** @param {string} content */
    const bold = content => OUTPUT_BOLD + content + OUTPUT_RESET

    console.log(
        [
            `${bold('Recording duration')}: ${green(res.duration + ' s')}  (${res.frames.length} frames found)`,
            `${bold('First visual change')}: ${green(res.first + ' s')}`,
            `${bold('Last visual change')}: ${green(res.complete + ' s')}`,
            `${bold('Speed Index')}: ${green(res.speedIndex.toFixed(1))}`,
            `${bold('Perceptual Speed Index')}: ${green(res.perceptualSpeedIndex.toFixed(1))}`,
            '',
            `${bold('Histogram visual progress:')}`
        ].join('\n')
    )

    const baseTs = res.frames[0].getTimeStamp()

    const progress = res.frames.map(frame => [frame.getTimeStamp() - baseTs, frame.getProgress()])
    console.log(babar(progress, { grid: 'grey' }))

    console.log(bold('Histogram perceptual visual progress:'))
    const perceptualProgress = res.frames.map(frame => [frame.getTimeStamp() - baseTs, frame.getPerceptualProgress()])
    console.log(babar(perceptualProgress, { grid: 'grey' }))
}

/** @param {Error} err */
function handleError(err) {
    console.error(err.message)
    console.log(Object.keys(err))
    if (err.stack) {
        console.log(err.stack)
    }

    process.exit(1)
}

// loudRejection()

module.exports = (timeline, opts) => {
    if (opts.fast) {
        // console.warn('WARNING: using --fast may result in different metrics due to skipped frames')
    }
    return speedIndex(timeline, { fastMode: opts.fast, ...opts })
        .then(res => {
            if (opts.pretty) {
                return displayPretty(res)
            }
            return display(res)
        })
        .catch(err => {
            handleError(err)
        })
}
