/*
Copyright (c) 2018, Ofte, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/* eslint-disable */

(function (window) {
    'use strict'

    let eventDeviceDiscovered = 'ofte-device-discovered' // a paired device has been found
    let eventDeviceNotFound = 'ofte-device-notfound'     // no paired devices have been found
    let eventDeviceErred = 'ofte-device-erred'           // the device encountered an error
    let eventDeviceClosed = 'ofte-device-closed'         // the device was closed
    let eventDeviceReset = 'ofte-device-reset'           // the device was reset
    let eventDevicePaired = 'ofte-device-paired'         // the device was selected from the UI
    let eventDeviceOpened = 'ofte-device-opened'         // the device was opened
    let eventDevicePlugged = 'ofte-device-plugged'       // the device was physically plugged into the computer
    let eventDeviceUnplugged = 'ofte-device-unplugged'   // the device was physically removed (or via UA)
    let eventDeviceInited = 'ofte-device-inited'         // the device initialized
    let eventDeviceProcessed = 'ofte-device-processed'   // the device processed a payload
    let eventSvcInited = 'ofte-service-inited'           // the service successfully initialized
    let eventSvcProcessed = 'ofte-service-processed'     // the service successfully processed
    let eventSvcKilled = 'ofte-service-killed'           // the service killed the session
    let eventSvcErred = 'ofte-service-erred'             // the service encountered an error
    let eventNetworkErred = 'ofte-network-erred'         // a network error prevented init or processing

    let statusNetworkError          = 460                // a general error with the network was encountered
    let statusNetworkTimeout        = 461                // a timeout error was encountered with a network request
	let statusInvalidTime           = 480                // the message timestamp was outside the allowed interval
	let statusSessionNonceInvalid   = 481                // the session nonce was incorrect
	let statusTokenNonceInvalid     = 482                // the token nonce was incorrect
	let statusKeyIDNotFound         = 483                // the keyID was not found/available
	let statusInvalidMessage        = 484                // the transmitted message was indecipherable
	let statusSessionNotFound       = 485                // the session was not found
    let statusValidationFailure     = 486                // the validation of a session failed
    

    function Ofte() {
        const vendorId = 0x16D0
        const configuration = 1
        const iface = 0
        const sessionHeader = "ofte-session"
        const tokenHeader = "ofte-token"

        var impl = {}
        var config = {
            serviceURL: 'https://demo.ofte.io:65443/v1',// the URL of the Ofte Auth Service (we'll supply this to you)
            interval: 1500,                             // the interval, in milliseconds, of continuous authentication
            adaptiveInterval: false,                    // if true, adapt the interval in accordance with network speed
            networkTimeout: 10000,                      // the timeout, in millseconds, for network requests
            autoStart: true,                            // if true, start authenticating as soon as the device is paired/opened
            debug: true                                 // if true, send debugging output to the console
        }
        impl.config = config

        // ofkeKey is the USB Device handle
        var ofteKey = null
        // buffer is the sole byte array used for input/output to device and server for continuous authentication
        var buffer = new ArrayBuffer(16)
        // signingBuffer is the byte array used for input/output to device and server for signing requests
        var signingBuffer = new ArrayBuffer(16)
        // sessionID is the session identifer returned from the server
        var sessionID = ""
        // timer is the interval handle for the processing phase
        var timer

        var events = {}
        events[eventDeviceDiscovered] = { desc: 'The ofte device was discovered', callbacks: new Array() }
        events[eventDeviceNotFound] = { desc: 'No ofte device was found', callbacks: new Array() }
        events[eventDeviceErred] = { desc: 'The ofte device erred', callbacks: new Array() }
        events[eventDeviceClosed] = { desc: 'The ofte device was closed', callbacks: new Array() }
        events[eventDeviceReset] = { desc: 'The ofte device reset', callbacks: new Array() }
        events[eventDevicePaired] = { desc: 'The ofte device was paired', callbacks: new Array() }
        events[eventDeviceOpened] = { desc: 'The ofte device was opened', callbacks: new Array() }
        events[eventDevicePlugged] = { desc: 'The ofte device was plugged in', callbacks: new Array() }
        events[eventDeviceUnplugged] = { desc: 'The ofte device was unplugged', callbacks: new Array() }
        events[eventDeviceInited] = { desc: 'The ofte device was initialized', callbacks: new Array() }
        events[eventDeviceProcessed] = { desc: 'The ofte device processed a payload', callbacks: new Array() }
        events[eventSvcInited] = { desc: 'The ofte service initialized a session', callbacks: new Array() }
        events[eventSvcProcessed] = { desc: 'The ofte service processed a payload', callbacks: new Array() }
        events[eventSvcKilled] = { desc: 'The ofte service killed the session', callbacks: new Array() }
        events[eventSvcErred] = { desc: 'The ofte service encounted an error', callbacks: new Array() }
        events[eventNetworkErred] = { desc: 'A network error was encountered', callbacks: new Array() }

        // Public functions
        // --------- • ---------

        impl.setConfig = function (config) {
            config = config
        }

        impl.getConfig = function () {
            return config
        }

        impl.on = function (eventName, func) {
            if (!verifyEventName(eventName)) {
                throw 'invalid event name ' + eventName
            }
            events[eventName].callbacks.push(func)
        }

        // pairDevice: Pair a device; this must come from a user-initiated event
        impl.pairDevice = async function () {
            if (ofteKey !== null) {
                await closeDevice()
            }
            if (config.debug) {
                console.log("ofte: pairing device")
            }
            let err = null
            let success = false
            await navigator.usb.requestDevice({ filters: [{ vendorId: vendorId }] })
                .then(async selectedDevice => {
                    ofteKey = selectedDevice
                    handleEvent(eventDevicePaired, ofteKey)
                    return await ofteKey.open()
                })
                .then(async () => {
                    await ofteKey.selectConfiguration(configuration)
                })
                .then(async () => {
                    await ofteKey.claimInterface(iface)
                    handleEvent(eventDeviceOpened, ofteKey)
                    success = true
                })
                .catch((err) => {
                    if (config.debug) {
                        console.log('ofte: error opening/selecting device:', err)
                    }
                    success = false
                    ofteKey = null
                    handleEvent(eventDeviceErred, err)
                })
            if (success == true && config.autoStart) {
                impl.startSession()
            }
            return success
        }

        // openDevice: Opens (open,selectConfig,claimInterface) the device
        impl.openDevice = async function () {
            let success = true
            if (ofteKey == null) {
                throw 'ofte: device not connected'
            }
            if (ofteKey.opened) {
                ofteKey.close()
            }
            await ofteKey.open()
                .catch((err) => {
                    success = false
                    if (config.debug) {
                        console.log('ofte: error opening device:', err)
                    }
                    ofteKey = null
                    handleEvent(eventDeviceErred, err)
                })
            if (!success) {
                return false
            }
            if (ofteKey.configuration === null) {
                await ofteKey.selectConfiguration(configuration)
                    .catch((err) => {
                        success = false
                        if (config.debug) {
                            console.log('ofte: error selecting device configuration:', err)
                        }
                        ofteKey = null
                        handleEvent(eventDeviceErred, err)
                    })
            }
            if (!success) {
                return false
            }
            await ofteKey.claimInterface(iface)
                .then(() => {
                    success = true
                    handleEvent(eventDeviceOpened, ofteKey)
                })
                .catch((err) => {
                    if (config.debug) {
                        console.log('ofte: error claiming device interface:', err)
                    }
                    success = false
                    ofteKey = null
                    handleEvent(eventDeviceErred, err)
                })
            return success
        }

        // startSession: Begin the ofte initialize and process rounds
        impl.startSession = async function () {
            if (ofteKey == null) {
                throw 'ofte device not opened'
            }
            let ok = await initialize()
            if (!ok) {
                return
            }
            if (config.debug) {
                console.log("ofte: initialized")
            }
            ok = await process()
            if (!ok) {
                return
            }
            processSessionWorker()
        }

        impl.endSession = async function () {
            await endSession()
        }

        impl.reset = async function () {
            await endSession()
            let found = await discoverDevices()
            if (found && config.autoStart) {
                let opened = await impl.openDevice()
                if (opened) {
                    impl.startSession()
                }
            }            
        }

        // Ofte-protected data retrieval functions
        // --------- • ---------

        // getDataResponse : Convenience function to handle generic databuffer POST requests, 
        // returning the http response via Promises
        impl.getDataResponse = function (method, url, data, timeout = config.networkTimeout) {
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, method, url, data, "arraybuffer", timeout)               
            })
        }

        // getFormResponse : Convenience function to handle generic FORM requests, 
        // returning the http response via Promises
        impl.getFormResponse = function (method, url, data, timeout = config.networkTimeout) {
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, method, url, data, "application/x-www-form-urlencoded", timeout)                
            })
        }

        // getJSONResponse : Convenience function to handle generic JSON requests, 
        // returning the http response via Promises
        impl.getJSONResponse = function (method, url, data, timeout = config.networkTimeout) {
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, method, url, data, "application/json", timeout)
            })
        }

        // getFormResponseAuthorized : Convenience function to handle Form posting. If an Ofte-session 
        // is active, both the session uuid and one-time authorization token are written to HTTP headers.
        // Your backend is responsible for validating these header values with the Ofte services.
        impl.getFormResponseAuthorized = function(method, url, data, timeout = config.networkTimeout) {
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, method, url, data, "application/x-www-form-urlencoded", timeout, true)
            })
        }

        // getJSONResponseAuthorized : Convenience function to handle submitting JSON data. If an Ofte-session 
        // is active, both the session uuid and one-time authorization token are written to HTTP headers
        // Your backend is responsible for validating these header values with the Ofte services.
        impl.getJSONResponseAuthorized = function (method, url, data, timeout = config.networkTimeout) {
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, method, url, data, "application/json", timeout, true)
            })
        }

        // Private functions
        // --------- • ---------

        function getError(xhr) {
            let detail = (xhr.responseType == '' || xhr.responseType == 'text') ? xhr.responseText : 'error'
            return {code: xhr.status, detail: detail}
        }

        async function getResponse(resolve, reject, method, url, data, contentType, timeout, token = false) {
            var xhr = new XMLHttpRequest()
            try {
                xhr.open(method, url)
            } catch (e) {
                reject({code: statusNetworkError, detail: e})
                return
            }
            xhr.onload = function () {
                if (this.status >= 200 && this.status < 300) {
                    resolve(this)
                } else {
                    reject(getError(this))
                }
            }
            xhr.onerror = function (err) {
                reject({code: statusNetworkError, detail: 'Network error'})
            }
            xhr.ontimeout = function (err) {
                reject({code: statusNetworkTimeout, detail: 'Network timeout error'})
            }
            if (data !== null) {
                xhr.setRequestHeader("Content-Type", contentType)
            }
            if (contentType === "arraybuffer") {
                xhr.responseType = "arraybuffer"
            }
            if (sessionID !== "") {
                xhr.setRequestHeader(sessionHeader, sessionID)
                if (token) {
                    let t = await getToken()
                    xhr.setRequestHeader(tokenHeader, t)
                }
            }
            xhr.timeout = timeout
            xhr.send(data)
        } 

        function handleEvent(eventName, detail = null) {
            let event = new CustomEvent(eventName, { detail: detail })
            document.dispatchEvent(event)
            if (!events[eventName]) {
                return
            }
            let callbacks = events[eventName].callbacks
            for (var i = 0; i < callbacks.length; ++i) {
                let f = callbacks[i]
                f.call(this, event)
            }
        }

        function verifyEventName(name) {
            return Object.keys(events).includes(name)
        }

        // discoverDevices: Look for already paired devices
        async function discoverDevices() {
            let success = false
            let devices = await navigator.usb.getDevices()
            if (config.debug) {
                console.log('ofte: devices', devices)
            }
            devices.forEach(async device => {
                if (device.vendorId == vendorId) {
                    ofteKey = device
                    if (config.debug) {
                        console.log('ofte: dispatching discovered', device)
                    }
                    handleEvent(eventDeviceDiscovered, device)
                    success = true
                } else {
                    if (config.debug) {
                        console.log('ofte: ignoring device from', device.manufacturerName)
                    }
                }
            })
            if (!success) {
                handleEvent(eventDeviceNotFound)
            }
            return success
        }

        // closeDevice: Close the device
        async function closeDevice() {
            if (ofteKey !== null) {
                await resetDevice()
                await ofteKey.close()
                handleEvent(eventDeviceClosed)
            }
        }

        // resetDevice: Reset the device
        async function resetDevice() {
            let success = false
            if (ofteKey !== null) {
                // to USB device (init)
                // ---------------------------------------
                await ofteKey.controlTransferOut({
                    requestType: 'vendor',
                    recipient: 'device',
                    request: 2,
                    value: 0,
                    index: 0
                }, buffer)
                    .then(() => ofteKey.controlTransferIn({
                        requestType: 'vendor',
                        recipient: 'device',
                        request: 20,
                        value: 0,
                        index: 0
                    }, 16))
                    .then(() => {
                        success = true
                        handleEvent(eventDeviceReset)
                    })
                    .catch((err) => {
                        if (config.debug) {
                            console.log("ofte: error resetting device", err)
                        }
                    })
            }
            console.log(">>>> RESET DEVICE STATE:", success)
            return success
        }

        // initialize: Send init sequence to device, then encoded packet to service
        async function initialize() {
            if (!navigator.onLine) {
                handleEvent(eventNetworkErred, "Network unavailable")
                return false
            }
            let success = false
            // to USB device (init)
            // ---------------------------------------
            await ofteKey.controlTransferOut({
                requestType: 'vendor',
                recipient: 'device',
                request: 2,
                value: 0,
                index: 0
            }, buffer)
                .then(() => ofteKey.controlTransferIn({
                    requestType: 'vendor',
                    recipient: 'device',
                    request: 14,
                    value: 0,
                    index: 0
                }, 16))
                // to Server (init)
                // ---------------------------------------
                .then(async (result) => {
                    handleEvent(eventDeviceInited)
                    await impl.getDataResponse("POST", config.serviceURL + "/i", result.data.buffer)
                        .then(function (resp) {
                            buffer = resp.response
                            if (buffer.byteLength != 16) {
                                throw "invalid buffer size: " + buffer.byteLength
                            }
                            sessionID = resp.getResponseHeader(sessionHeader)
                            if (config.debug) {
                                console.log("ofte: setting up sessionID:", sessionID)
                            }
                            if (sessionID == "") {
                                throw "empty session id"
                            }
                            handleEvent(eventSvcInited, sessionID)
                            success = true
                        })
                        .catch(function (err) {
                            handleEvent(eventSvcErred, err)
                            if (config.debug) {
                                console.log("ofte: error initializing to server", err)
                            }
                        })
                })
                .catch((err) => {
                    handleEvent(eventDeviceErred, err)
                    if (config.debug) {
                        console.log("ofte: error initializing device", err)
                    }
                })
            return success
        }

        // process: Process a continuous authentication round
        async function process() {
            if (!navigator.onLine) {
                handleEvent(eventNetworkErred, "Network unavailable")
                return false
            }
            let success = false
            // to USB device (process)
            // ---------------------------------------
            await ofteKey.controlTransferOut({
                requestType: 'vendor',
                recipient: 'device',
                request: 2,
                value: 0,
                index: 0
            }, buffer)
                .then(() => ofteKey.controlTransferIn({
                    requestType: 'vendor',
                    recipient: 'device',
                    request: 12,
                    value: 0,
                    index: 0
                }, 16)
                )
                // to Server (process)
                // ---------------------------------------
                .then(async (result) => {
                    if (result === undefined) {
                        handleEvent(eventDeviceErred, "invalid result from transferIn")
                        throw "invalid result from transferIn"
                    }
                    handleEvent(eventDeviceProcessed)
                    await impl.getDataResponse("POST", config.serviceURL + "/p/" + sessionID, result.data.buffer)
                        .then(function (resp) {
                            buffer = resp.response
                            if (buffer.byteLength != 16) {
                                throw "invalid buffer size:" + buffer.byteLength
                            }
                            handleEvent(eventSvcProcessed)
                            success = true
                        })
                        .catch(function (err) {
                            handleEvent(eventSvcErred, err)
                            endSession()
                            if (config.debug) {
                                console.log("ofte: error processing to server", err)
                            }
                        })
                })
                .catch((err) => {
                    handleEvent(eventDeviceErred, err)
                    if (config.debug) {
                        console.log("ofte: error processing to server", err)
                    }
                })
            return success
        }

        // token: Request a one-time token from the key
        async function getToken() {
            let signature = ''
            if (!navigator.onLine) {
                handleEvent(eventNetworkErred, "Network unavailable")
                return signature
            }
            // to USB device (sign)
            // ---------------------------------------
            await ofteKey.controlTransferOut({
                requestType: 'vendor',
                recipient: 'device',
                request: 2,
                value: 0,
                index: 0
            }, signingBuffer)
                .then(() => ofteKey.controlTransferIn({
                    requestType: 'vendor',
                    recipient: 'device',
                    request: 24,
                    value: 0,
                    index: 0
                }, 16)
                )
                .then(async (result) => {
                    if (result === undefined) {
                        handleEvent(eventDeviceErred, "invalid result from signing transferIn")
                        throw "invalid result from transferIn"
                    }                    
                    signature = toHexString(new Uint8Array(result.data.buffer))
                })
                .catch((err) => {
                    handleEvent(eventDeviceErred, err)
                    if (config.debug) {
                        console.log("ofte: error processing signing result", err)
                    }
                })
            return signature
        }

        function toHexString(byteArray) {
            return Array.from(byteArray, function (byte) {
                return ('0' + (byte & 0xFF).toString(16)).slice(-2)
            }).join('')
        }


        // processSessionWorker: Handler for session processing rounds
        async function processSessionWorker() {
            let ok = await process()
            if (!ok) {
                clearInterval(timer)
                return
            }
            timer = setTimeout(processSessionWorker, config.interval)
        }

        // endSession: End the ofte session (user-agent initiated)
        async function endSession() {
            clearInterval(timer)
            await closeDevice()
            buffer = new ArrayBuffer(16)
            await impl.getDataResponse("DELETE", config.serviceURL + "/p/" + sessionID)
                .then(function (resp) {
                    if (config.debug) {
                        console.log("ofte: deleted session: ", sessionID)
                    }
                })
                .catch(function (err) {
                    if (config.debug) {
                        console.log("ofte: error deleting to server", err)
                    }
                })
            sessionID = ''
        }

        document.addEventListener('DOMContentLoaded', async () => {
            let found = await discoverDevices()
            if (found && config.autoStart) {
                let opened = await impl.openDevice()
                if (opened) {
                    await impl.startSession()
                }
            }
        })

        navigator.usb.addEventListener('connect', async (event) => {
            if (config.debug) {
                console.log('ofte: device plugged in....', event.device)
            }
            if (event.device.vendorId === vendorId) {
                ofteKey = event.device
                handleEvent(eventDevicePlugged, event.device)
                if (config.autoStart) {
                    let opened = await impl.openDevice()
                    if (opened) {
                        impl.startSession()
                    }
                }    
            }
        })

        navigator.usb.addEventListener('disconnect', (event) => {
            if (config.debug) {
                console.log("ofte: device unplugged")
            }
            ofteKey = null
            handleEvent(eventDeviceUnplugged)
        })

        window.addEventListener('online',  (event) => {
            console.log('detected online!')
        })        

        window.addEventListener('offline',  (event) => {
            console.log('detected offline!')
        })        

        return impl
    }

    if (typeof (window.ofte) === 'undefined') {
        window.ofte = Ofte()

        var scripts = document.getElementsByTagName('script');
        var lastScript = scripts[scripts.length-1];
        window.ofte.config = {
            serviceURL: lastScript.getAttribute("data-service-url") ? lastScript.getAttribute("data-service-url") : window.ofte.config.serviceURL,
            interval: parseInt(lastScript.getAttribute("data-interval") ? lastScript.getAttribute("data-interval") : window.ofte.config.interval),
            adaptiveInterval: lastScript.getAttribute("data-adaptive-interval") ? (lastScript.getAttribute("data-adaptive-interval") == 'true') : window.ofte.config.adaptiveInterval,
            networkTimeout: parseInt(lastScript.getAttribute("data-network-timeout") ? lastScript.getAttribute("data-network-timeout") : window.ofte.config.networkTimeout),
            autoStart: lastScript.getAttribute("data-autostart") ? (lastScript.getAttribute("data-autostart") == 'true') : window.ofte.config.autoStart,
            debug: lastScript.getAttribute("data-debug") ? (lastScript.getAttribute("data-debug") == 'true') : window.ofte.config.debug
        }
        // TODO: validate passed config variables

        window.ofte.getJSONResponse("GET", window.ofte.config.serviceURL + '/version')
            .then(result => {
                console.log('Ofte Auth Service version:', result.response)
            })
            .catch(err => {
                console.log('error connecting to Ofte Auth Service', err)
            })

        window.ofte.eventDeviceDiscovered = eventDeviceDiscovered
        window.ofte.eventDeviceNotFound = eventDeviceNotFound
        window.ofte.eventDeviceErred = eventDeviceErred
        window.ofte.eventDeviceClosed = eventDeviceClosed
        window.ofte.eventDeviceReset = eventDeviceReset
        window.ofte.eventDevicePaired = eventDevicePaired
        window.ofte.eventDeviceOpened = eventDeviceOpened
        window.ofte.eventDevicePlugged = eventDevicePlugged
        window.ofte.eventDeviceUnplugged = eventDeviceUnplugged
        window.ofte.eventDeviceInited = eventDeviceInited
        window.ofte.eventDeviceProcessed = eventDeviceProcessed
        window.ofte.eventSvcInited = eventSvcInited
        window.ofte.eventSvcProcessed = eventSvcProcessed
        window.ofte.eventSvcKilled = eventSvcKilled
        window.ofte.eventSvcErred = eventSvcErred
        window.ofte.eventNetworkErred = eventNetworkErred
    }

})(window)
