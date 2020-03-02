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

    function Ofte() {
        const sessionHeader = "ofte-sessionid"
        const tokenHeader = "ofte-accesstoken"

        var impl = {}
        impl.config = {
            authServiceURL: 'https://localhost:2357',   // the URL of your Ofte Auth Service instance, defaults to localhost for testing
            interval: 20000,                            // the interval, in milliseconds, of continuous authentication
            networkTimeout: 10000,                      // the timeout, in millseconds, for network requests
            debug: true                                 // if true, send debugging output to the console
        }

        // sessionID is the session identifer returned from the Ofte auth service
        var sessionID = ""
        // timer is the interval handle for the processing phase
        var timer


        // Public functions
        // --------- • ---------

        // setConfig: updates the Ofte config
        impl.setConfig = function (config) {
            impl.config = config
        }

        // getConfig: returns the Ofte config
        impl.getConfig = function () {
            return impl.config
        }

        /*
            getOrCreatePrincipal adds public attributes of a principal (a person) in the 
            Ofte platform instance with which subsequent authenticators and keys can associated.
            The Ofte platform does not store private keys or other sensitive credentials.
            
            Example data structure:
            {
                "username": "matthew@ofte.io",
                "displayName": "Matthew McNeely",
                "icon": "http://img.com/me.jpg"
            }
        */
        impl.getOrCreatePrincipal = function (principalData) {
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, "POST", impl.config.authServiceURL + '/auth/v1/principals', principalData)
            })
        }

        impl.registerFIDOKey = function (username) {
            return getJSONData(impl.config.authServiceURL + '/auth/v1/start_fido_registration/' + username)
                .then(credentialCreationOptions => {
                    credentialCreationOptions.publicKey.challenge = bufferDecode(credentialCreationOptions.publicKey.challenge);
                    credentialCreationOptions.publicKey.user.id = bufferDecode(credentialCreationOptions.publicKey.user.id);
                    if (credentialCreationOptions.publicKey.excludeCredentials) {
                        for (var i = 0; i < credentialCreationOptions.publicKey.excludeCredentials.length; i++) {
                            credentialCreationOptions.publicKey.excludeCredentials[i].id = bufferDecode(credentialCreationOptions.publicKey.excludeCredentials[i].id);
                        }
                    }
                    if (impl.debug) {
                        console.log("inbound create options: ", credentialCreationOptions.publicKey);
                    }
                    return navigator.credentials.create({
                        publicKey: credentialCreationOptions.publicKey
                    })
                })
                .then(async credential => {
                    let attestationObject = credential.response.attestationObject;
                    let clientDataJSON = credential.response.clientDataJSON;
                    let rawId = credential.rawId;

                    let data = {
                        id: credential.id,
                        rawId: bufferEncode(rawId),
                        type: credential.type,
                        response: {
                            attestationObject: bufferEncode(attestationObject),
                            clientDataJSON: bufferEncode(clientDataJSON),
                        },
                    }

                    return await postJSONData(impl.config.authServiceURL + '/auth/v1/finish_fido_registration/' + username, data)
                })
                /*
                .then(async authenticator => {
                    console.log("start wait of register ofte key")
                    await registerOfteKey(username)
                        .then((resp) => {
                            console.log("after wait of register ofte key", resp)
                        })
                })
                */
        }


        impl.registerFIDOKeyOLD = async function (username) {
            return await getResponsePromise("GET",
                impl.config.authServiceURL + '/auth/v1/start_fido_registration/' + username)
                .then((credentialCreationOptions) => {
                    credentialCreationOptions.publicKey.challenge = bufferDecode(credentialCreationOptions.publicKey.challenge);
                    credentialCreationOptions.publicKey.user.id = bufferDecode(credentialCreationOptions.publicKey.user.id);
                    if (credentialCreationOptions.publicKey.excludeCredentials) {
                        for (var i = 0; i < credentialCreationOptions.publicKey.excludeCredentials.length; i++) {
                            credentialCreationOptions.publicKey.excludeCredentials[i].id = bufferDecode(credentialCreationOptions.publicKey.excludeCredentials[i].id);
                        }
                    }
                    if (impl.debug) {
                        console.log("inbound create options: ", credentialCreationOptions.publicKey);
                    }
                    return navigator.credentials.create({
                        publicKey: credentialCreationOptions.publicKey
                    })
                })
                .then(function (credential) {
                    let attestationObject = credential.response.attestationObject;
                    let clientDataJSON = credential.response.clientDataJSON;
                    let rawId = credential.rawId;

                    return getResponsePromise("POST",
                        impl.config.authServiceURL + '/auth/v1/finish_fido_registration/' + username,
                        JSON.stringify({
                            id: credential.id,
                            rawId: bufferEncode(rawId),
                            type: credential.type,
                            response: {
                                attestationObject: bufferEncode(attestationObject),
                                clientDataJSON: bufferEncode(clientDataJSON),
                            },
                        }))
                })
                .then(function (a11r) {
                    console.log("after finish fido:", a11r)
                    if (a11r.certLabel !== undefined && a11r.certLabel.startsWith("Ofte")) {
                        return registerOfteKey(username)
                    }
                    a11r.isOfteKey = false
                    return (a11r)
                })
                .then(function (a11r) {
                    console.log("in final then clause...")
                    return (a11r)
                })
                .catch((error) => {
                    if (impl.debug) {
                        console.log("failed to register " + username, error)
                    }
                    //reject("failed to reg " + username + " error " + error)
                    throw new Error("failed to reg " + username + " error " + error)
                })
        }

        /*
            loginFIDOKey is a Promise-based function that authenticates a registered username and authenticator. During 
            authentication an assertion is created, which is proof that the user has possession of the private key. 
            This assertion contains a signature created using the private key. The server uses the public key retrieved 
            during registration to verify this signature.

            If the authenticator being logged in is an Ofte key, a CA session will be started.
        */
        impl.loginFIDOKey = async function (username) {
            return new Promise(async (resolve, reject) => {
                var result
                await getResponsePromise("GET",
                    impl.config.authServiceURL + '/auth/v1/start_fido_login/' + username)
                    .then((credentialRequestOptions) => {
                        credentialRequestOptions.publicKey.userVerification = 'discouraged';
                        credentialRequestOptions.publicKey.challenge = bufferDecode(credentialRequestOptions.publicKey.challenge);
                        credentialRequestOptions.publicKey.allowCredentials.forEach(function (listItem) {
                            listItem.id = bufferDecode(listItem.id)
                        });

                        return navigator.credentials.get({
                            publicKey: credentialRequestOptions.publicKey,
                            password: true
                        })
                    })
                    .then(async function (assertion) {
                        let authData = assertion.response.authenticatorData;
                        let clientDataJSON = assertion.response.clientDataJSON;
                        let rawId = assertion.rawId;
                        let sig = assertion.response.signature;
                        let userHandle = assertion.response.userHandle;

                        await getResponsePromise("POST",
                            impl.config.authServiceURL + '/auth/v1/finish_fido_login/' + username,
                            JSON.stringify({
                                id: assertion.id,
                                rawId: bufferEncode(rawId),
                                type: assertion.type,
                                response: {
                                    authenticatorData: bufferEncode(authData),
                                    clientDataJSON: bufferEncode(clientDataJSON),
                                    signature: bufferEncode(sig),
                                    userHandle: bufferEncode(userHandle),
                                },
                            })
                        )
                            .then(resp => {
                                result = resp
                            })
                            .catch(function (response) {
                                throw new Error(response.responseText)
                            })
                    })
                    .then(() => {
                        // Start an Ofte CA session
                        if (result.value !== "") {
                            // TODO: kill any existing session
                            sessionID = result.value
                            if (impl.config.debug) {
                                console.log('Starting Ofte CA session', sessionID)
                            }
                            broadcastEvent('ofte-session-start', sessionID)
                            startCA()
                        }
                        resolve(result)
                    })
                    .catch((error) => {
                        console.log("failed to auth", username, "error", error)
                        reject("failed to auth", username, "error", error)
                    })
            })
        }

        impl.request = function (method, url, data, contentType = "application/json", timeout = impl.config.networkTimeout) {
            if (sessionID === "") {
                throw new Error("SessionID is null")
            }
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, method, url, data, [["Ofte-SessionID", sessionID]], contentType, timeout)
            })
        }

        impl.requestStrong = function (method, url, data, contentType = "application/json", timeout = impl.config.networkTimeout) {
            if (sessionID === "") {
                throw new Error("SessionID is null")
            }

            return new Promise(function (resolve, reject) {

                let t0 = performance.now()
                let callback = function (resp) {
                    let ofteError = ofteU2FError(resp)
                    if (ofteError != "") {
                        throw new Error(ofteError)
                    }
                    var request = new XMLHttpRequest();
                    request.open('POST', impl.config.authServiceURL + "/auth/v1/finish_ofte_access/" + sessionID, true);
                    request.setRequestHeader('Content-Type', 'application/json;');

                    request.onload = async function () {
                        if (this.status == 200) {
                            resetTimer(sessionID)
                            let token = this.getResponseHeader("Ofte-AccessToken")
                            await getResponse(resolve, reject, method, url, data, [["Ofte-SessionID", sessionID], ["Ofte-AccessToken", token]], contentType, timeout)
                                .then(() => {
                                    if (impl.config.debug) {
                                        console.log("requestStrong took " + (performance.now() - t0) + " milliseconds");
                                    }
                                    broadcastEvent('ofte-access', url)
                                })
                                .catch((err) => {
                                    broadcastEvent('ofte-error', err)
                                })
                        } else {
                            throw new Error(this.response.responseText)
                        }
                    };
                    request.onerror = function () {
                        throw new Error('Connection error')
                    };

                    request.send(JSON.stringify(resp))
                }

                var request = new XMLHttpRequest();
                request.open('GET', impl.config.authServiceURL + "/auth/v1/start_ofte_access/" + sessionID, true);

                request.onload = function () {
                    if (this.status == 200) {
                        let req = JSON.parse(request.responseText)
                        u2f.sign(req.appId, req.challenge, req.registeredKeys, callback, 30);
                    } else {
                        throw new Error(this.response.responseText)
                    }
                };
                request.onerror = function () {
                    throw new Error('Connection error')
                };
                request.send()
            })
        }

        impl.endSession = function () {
            stopCA()
            let session = sessionID
            impl.sessionID = ""
            return getResponsePromise("POST", impl.config.authServiceURL + "/auth/v1/end_session/" + session)
        }

        // Private functions
        // --------- • ---------

        const status = response => {
            if (response.status >= 200 && response.status < 300) {
                return Promise.resolve(response)
            }
            return Promise.reject(new Error(response.statusText))
        }

        const json = response => response.json()

        async function getJSONData(url) {
            return await fetch(url)
                .then(status)
                .then(json)
        }

        async function postJSONData(url, data = {}) {
            let options = {
                method: 'POST',
                credentials: 'omit', // include, *same-origin, omit
            }
            if (!hasJSONStructure(data)) {
                options.body = JSON.stringify(data)
            }
            return await fetch(url, options)
            .then(status)
            .then(json)
        }

        impl.registerOfteKey = function (username) {
            return new Promise((resolve, reject) => {
                var a11r

                const callback = function (resp) {
                    console.log('in callback method', resp)
                    let ofteError = ofteU2FError(resp)
                    if (ofteError != "") {
                        reject(ofteError)
                    }
                    postJSONData(impl.config.authServiceURL + "/auth/v1/finish_ofte_registration/" + username, resp)
                        .then(resp => {
                            resp.isOfteKey = true
                            console.log('resp:', resp)
                            broadcastEvent('ofte-key-registered', resp)
                            a11r = resp
                            resolve(a11r)
                        })
                        .catch(err => {
                            reject(err)
                        })
                }    

                getJSONData(impl.config.authServiceURL + "/auth/v1/start_ofte_registration/" + username)
                .then(async resp => {
                    broadcastEvent('ofte-key-start-registration', resp)
                    console.log("before u2f register")
                    u2f.register(resp.appId, resp.registerRequests, resp.registeredKeys, callback, 10);
                    console.log("after u2f register")
                })
                .catch(err => {
                    reject(err)
                })

                console.log('returning from register ofte key')
            })
        }

        function registerOfteKeyOLD(username) {
            var _resolve
            var _reject

            var callback = function (resp) {
                let ofteError = ofteU2FError(resp)
                if (ofteError != "") {
                    _reject(ofteError)
                }
                getResponsePromise('POST',
                    impl.config.authServiceURL + "/auth/v1/finish_ofte_registration/" + username,
                    resp)
                    .then(resp => {
                        resp.isOfteKey = true
                        console.log('resp:', resp)
                        broadcastEvent('ofte-key-registered', resp)
                        _resolve(resp)
                    })
                    .catch(err => {
                        _reject(err)
                    })
            }

            return new Promise((resolve, reject) => {
                _resolve = resolve
                _reject = reject
                getResponsePromise("GET", impl.config.authServiceURL + "/auth/v1/start_ofte_registration/" + username)
                    .then(async resp => {
                        broadcastEvent('ofte-key-start-registration', resp)
                        await u2f.register(resp.appId, resp.registerRequests, resp.registeredKeys, callback, 10);
                    })
                    .catch(err => {
                        reject(err)
                    })
                console.log("here at 394....")
            })
        }

        function getResponsePromise(method, url, data, headers = [], contentType = "application/json", timeout = impl.config.networkTimeout) {
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, method, url, data, headers, contentType, timeout)
            })
        }

        async function getResponse(resolve, reject, method, url, data, headers = [], contentType = "application/json", timeout = impl.config.networkTimeout) {
            var xhr = new XMLHttpRequest()
            try {
                xhr.open(method, url)
            } catch (e) {
                reject(e)
                return
            }
            xhr.onload = function () {
                if (this.status >= 200 && this.status < 300) {
                    if (xhr.responseText != "") {
                        switch (xhr.getResponseHeader("Content-Type")) {
                            case "application/json":
                                resolve(JSON.parse(xhr.responseText))
                            default:
                                resolve(xhr.responseText)
                        }
                    } else {
                        resolve(this);
                    }
                } else {
                    reject(xhr.responseText)
                }
            }
            xhr.onerror = function (err) {
                reject(err)
            }
            xhr.ontimeout = function (err) {
                reject('Network timeout error' + err)
            }
            if (data !== null) {
                xhr.setRequestHeader("Content-Type", contentType)
                switch (contentType) {
                    case 'application/json':
                        if (!hasJSONStructure(data)) {
                            data = JSON.stringify(data);
                        }
                        break;
                    case 'arraybuffer':
                        xhr.responseType = "arraybuffer"
                }
            }
            xhr.timeout = timeout
            for (let i = 0; i < headers.length; i++) {
                xhr.setRequestHeader(headers[i][0], headers[i][1])
            }
            xhr.send(data)
        }

        function ofteAssert() {
            if (sessionID === "") {
                throw new Error("SessionID is nil")
            }

            let callback = function (resp) {
                let ofteError = ofteU2FError(resp)
                if (ofteError != "") {
                    throw new Error(ofteError)
                }
                var request = new XMLHttpRequest();
                request.open('POST', impl.config.authServiceURL + "/auth/v1/finish_ofte_assert/" + sessionID, true);
                request.setRequestHeader('Content-Type', 'application/json;');

                request.onload = function () {
                    if (this.status == 200) {
                        broadcastEvent('ofte-key-assert', sessionID)
                    } else {
                        throw new Error(this.response.responseText)
                    }
                };
                request.onerror = function () {
                    throw new Error('Connection error')
                };
                request.send(JSON.stringify(resp))
            }

            var request = new XMLHttpRequest();
            request.open('GET', impl.config.authServiceURL + "/auth/v1/start_ofte_assert/" + sessionID, true);

            request.onload = function () {
                if (this.status == 200) {
                    let req = JSON.parse(request.responseText)
                    u2f.sign(req.appId, req.challenge, req.registeredKeys, callback, 30);
                } else {
                    throw new Error(this.response.responseText)
                }
            };
            request.onerror = function () {
                throw new Error('Connection error')
            };
            request.send()
        }

        // Check for an error in the a11r response object
        function ofteU2FError(resp) {
            if (!('errorCode' in resp)) {
                return "";
            }
            if (resp.errorCode === u2f.ErrorCodes['OK']) {
                return "";
            }
            let msg = 'ofte error code ' + resp.errorCode;
            for (name in u2f.ErrorCodes) {
                if (u2f.ErrorCodes[name] === resp.errorCode) {
                    msg += ' (' + name + ')';
                }
            }
            if (resp.errorMessage) {
                msg += ': ' + resp.errorMessage;
            }
            if (window.ofte.config.debug) {
                console.log("u2f/Ofte Error:", msg)
            }
            return msg;
        }

        function startCA() {
            ofteAssert()
            timer = window.setTimeout(startCA, impl.config.interval)
        }

        function stopCA() {
            window.clearTimeout(timer)
        }

        function resetTimer() {
            window.clearTimeout(timer)
            timer = window.setTimeout(startCA, impl.config.interval)
        }

        function broadcastEvent(eventName, detail = null) {
            let event = new CustomEvent(eventName, { detail: detail })
            document.dispatchEvent(event)
        }


        // Base64 to ArrayBuffer
        function bufferDecode(value) {
            return Uint8Array.from(atob(value), c => c.charCodeAt(0));
        }

        // ArrayBuffer to URLBase64
        function bufferEncode(value) {
            return btoa(String.fromCharCode.apply(null, new Uint8Array(value)))
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=/g, "");;
        }

        function hasJSONStructure(str) {
            if (typeof str !== 'string') return false;
            try {
                const result = JSON.parse(str);
                const type = Object.prototype.toString.call(result);
                return type === '[object Object]'
                    || type === '[object Array]';
            } catch (err) {
                return false;
            }
        }

        function getError(xhr) {
            let detail = (xhr.responseType == '' || xhr.responseType == 'text') ? xhr.responseText : 'error'
            return { code: xhr.status, detail: detail }
        }

        document.addEventListener('DOMContentLoaded', async () => {
        })


        window.addEventListener('online', (event) => {
            console.log('detected online!')
        })

        window.addEventListener('offline', (event) => {
            console.log('detected offline!')
        })

        // TODO: update this
        window.onbeforeunload = function () {
            try {
                if (sessionID != '') {
                    var xhr = new XMLHttpRequest()
                    xhr.open("DELETE", window.ofte.config.serviceURL + "/s/" + sessionID, false)
                    xhr.send()
                }
            } catch (e) {
                console.log(e, e.stack);
            }
        }


        // Use a worker-based timer to get more consistent scheduling for setTimeout
        // --------- • ---------

        function workerBlob() {
            var timers = {}

            function fireTimeout(id) {
                this.postMessage({ id: id })
                delete timers[id]
            }

            this.addEventListener("message", function (evt) {
                var data = evt.data

                switch (data.command) {
                    case "setTimeout":
                        var time = parseInt(data.timeout || 0, 10),
                            timer = setTimeout(fireTimeout.bind(null, data.id), time)
                        timers[data.id] = timer
                        break
                    case "clearTimeout":
                        var timer = timers[data.id]
                        if (timer) clearTimeout(timer)
                        delete timers[data.id]
                }
            })
        }

        var timeoutId = 0
        var timeouts = {}
        let worker = new Worker(URL.createObjectURL(new Blob(["(" + workerBlob.toString() + ")()"], { type: 'text/javascript' })))

        worker.addEventListener("message", function (evt) {
            var data = evt.data,
                id = data.id,
                fn = timeouts[id].fn,
                args = timeouts[id].args

            fn.apply(null, args)
            delete timeouts[id]
        });

        // override the native setTimeout function
        window.setTimeout = function (fn, delay) {
            var args = Array.prototype.slice.call(arguments, 2)
            timeoutId += 1
            delay = delay || 0
            var id = timeoutId
            timeouts[id] = { fn: fn, args: args }
            worker.postMessage({ command: "setTimeout", id: id, timeout: delay })
            return id
        };

        // override the native clearTimeout function
        window.clearTimeout = function (id) {
            worker.postMessage({ command: "clearTimeout", id: id })
            delete timeouts[id]
        };

        return impl
    }

    if (typeof (window.ofte) === 'undefined') {
        window.ofte = Ofte()

        var scripts = document.getElementsByTagName('script');
        var lastScript = scripts[scripts.length - 1];
        window.ofte.config = {
            authServiceURL: lastScript.getAttribute("data-auth-service-url") ? lastScript.getAttribute("data-auth-service-url") : window.ofte.config.authServiceURL,
            interval: parseInt(lastScript.getAttribute("data-interval") ? lastScript.getAttribute("data-interval") : window.ofte.config.interval),
            networkTimeout: parseInt(lastScript.getAttribute("data-network-timeout") ? lastScript.getAttribute("data-network-timeout") : window.ofte.config.networkTimeout),
            debug: lastScript.getAttribute("data-debug") ? (lastScript.getAttribute("data-debug") == 'true') : window.ofte.config.debug
        }
        // TODO: validate passed config variables

        if (window.ofte.config.authServiceURL === undefined) {
            let msg = "Ofte Error: the auth service URL is undefined. See https://ofte.io/todo.html for configuration help"
            console.log(msg)
            throw new Error(msg)
        }

        fetch(window.ofte.config.authServiceURL + '/auth/v1/version')
            .then((response) => response.text())
            .then((data) => {
                console.log(data)
            })
            .catch((err) => {
                console.log('Ofte Error: error connecting to Ofte Auth Service ' + window.ofte.config.authServiceURL, err)
            })
    }

})(window)


//Copyright 2014-2015 Google Inc. All rights reserved.

//Use of this source code is governed by a BSD-style
//license that can be found in the LICENSE file or at
//https://developers.google.com/open-source/licenses/bsd

/**
 * @fileoverview The U2F api.
 */
'use strict';


/**
 * Namespace for the U2F api.
 * @type {Object}
 */
var u2f = u2f || {};

/**
 * FIDO U2F Javascript API Version
 * @number
 */
var js_api_version;

/**
 * The U2F extension id
 * @const {string}
 */
// The Chrome packaged app extension ID.
// Uncomment this if you want to deploy a server instance that uses
// the package Chrome app and does not require installing the U2F Chrome extension.
u2f.EXTENSION_ID = 'kmendfapggjehodndflmmgagdbamhnfd';
// The U2F Chrome extension ID.
// Uncomment this if you want to deploy a server instance that uses
// the U2F Chrome extension to authenticate.
// u2f.EXTENSION_ID = 'pfboblefjcgdjicmnffhdgionmgcdmne';


/**
 * Message types for messsages to/from the extension
 * @const
 * @enum {string}
 */
u2f.MessageTypes = {
    'U2F_REGISTER_REQUEST': 'u2f_register_request',
    'U2F_REGISTER_RESPONSE': 'u2f_register_response',
    'U2F_SIGN_REQUEST': 'u2f_sign_request',
    'U2F_SIGN_RESPONSE': 'u2f_sign_response',
    'U2F_GET_API_VERSION_REQUEST': 'u2f_get_api_version_request',
    'U2F_GET_API_VERSION_RESPONSE': 'u2f_get_api_version_response'
};


/**
 * Response status codes
 * @const
 * @enum {number}
 */
u2f.ErrorCodes = {
    'OK': 0,
    'OTHER_ERROR': 1,
    'BAD_REQUEST': 2,
    'CONFIGURATION_UNSUPPORTED': 3,
    'DEVICE_INELIGIBLE': 4,
    'TIMEOUT': 5
};


/**
 * A message for registration requests
 * @typedef {{
 *   type: u2f.MessageTypes,
 *   appId: ?string,
 *   timeoutSeconds: ?number,
 *   requestId: ?number
 * }}
 */
u2f.U2fRequest;


/**
 * A message for registration responses
 * @typedef {{
 *   type: u2f.MessageTypes,
 *   responseData: (u2f.Error | u2f.RegisterResponse | u2f.SignResponse),
 *   requestId: ?number
 * }}
 */
u2f.U2fResponse;


/**
 * An error object for responses
 * @typedef {{
 *   errorCode: u2f.ErrorCodes,
 *   errorMessage: ?string
 * }}
 */
u2f.Error;

/**
 * Data object for a single sign request.
 * @typedef {enum {BLUETOOTH_RADIO, BLUETOOTH_LOW_ENERGY, USB, NFC}}
 */
u2f.Transport;


/**
 * Data object for a single sign request.
 * @typedef {Array<u2f.Transport>}
 */
u2f.Transports;

/**
 * Data object for a single sign request.
 * @typedef {{
 *   version: string,
 *   challenge: string,
 *   keyHandle: string,
 *   appId: string
 * }}
 */
u2f.SignRequest;


/**
 * Data object for a sign response.
 * @typedef {{
 *   keyHandle: string,
 *   signatureData: string,
 *   clientData: string
 * }}
 */
u2f.SignResponse;


/**
 * Data object for a registration request.
 * @typedef {{
 *   version: string,
 *   challenge: string
 * }}
 */
u2f.RegisterRequest;


/**
 * Data object for a registration response.
 * @typedef {{
 *   version: string,
 *   keyHandle: string,
 *   transports: Transports,
 *   appId: string
 * }}
 */
u2f.RegisterResponse;


/**
 * Data object for a registered key.
 * @typedef {{
 *   version: string,
 *   keyHandle: string,
 *   transports: ?Transports,
 *   appId: ?string
 * }}
 */
u2f.RegisteredKey;


/**
 * Data object for a get API register response.
 * @typedef {{
 *   js_api_version: number
 * }}
 */
u2f.GetJsApiVersionResponse;


//Low level MessagePort API support

/**
 * Sets up a MessagePort to the U2F extension using the
 * available mechanisms.
 * @param {function((MessagePort|u2f.WrappedChromeRuntimePort_))} callback
 */
u2f.getMessagePort = function (callback) {
    if (typeof chrome != 'undefined' && chrome.runtime) {
        // The actual message here does not matter, but we need to get a reply
        // for the callback to run. Thus, send an empty signature request
        // in order to get a failure response.
        var msg = {
            type: u2f.MessageTypes.U2F_SIGN_REQUEST,
            signRequests: []
        };
        chrome.runtime.sendMessage(u2f.EXTENSION_ID, msg, function () {
            if (!chrome.runtime.lastError) {
                // We are on a whitelisted origin and can talk directly
                // with the extension.
                u2f.getChromeRuntimePort_(callback);
            } else {
                // chrome.runtime was available, but we couldn't message
                // the extension directly, use iframe
                u2f.getIframePort_(callback);
            }
        });
    } else if (u2f.isAndroidChrome_()) {
        u2f.getAuthenticatorPort_(callback);
    } else if (u2f.isIosChrome_()) {
        u2f.getIosPort_(callback);
    } else {
        // chrome.runtime was not available at all, which is normal
        // when this origin doesn't have access to any extensions.
        u2f.getIframePort_(callback);
    }
};

/**
 * Detect chrome running on android based on the browser's useragent.
 * @private
 */
u2f.isAndroidChrome_ = function () {
    var userAgent = navigator.userAgent;
    return userAgent.indexOf('Chrome') != -1 &&
        userAgent.indexOf('Android') != -1;
};

/**
 * Detect chrome running on iOS based on the browser's platform.
 * @private
 */
u2f.isIosChrome_ = function () {
    return $.inArray(navigator.platform, ["iPhone", "iPad", "iPod"]) > -1;
};

/**
 * Connects directly to the extension via chrome.runtime.connect.
 * @param {function(u2f.WrappedChromeRuntimePort_)} callback
 * @private
 */
u2f.getChromeRuntimePort_ = function (callback) {
    var port = chrome.runtime.connect(u2f.EXTENSION_ID,
        { 'includeTlsChannelId': true });
    setTimeout(function () {
        callback(new u2f.WrappedChromeRuntimePort_(port));
    }, 0);
};

/**
 * Return a 'port' abstraction to the Authenticator app.
 * @param {function(u2f.WrappedAuthenticatorPort_)} callback
 * @private
 */
u2f.getAuthenticatorPort_ = function (callback) {
    setTimeout(function () {
        callback(new u2f.WrappedAuthenticatorPort_());
    }, 0);
};

/**
 * Return a 'port' abstraction to the iOS client app.
 * @param {function(u2f.WrappedIosPort_)} callback
 * @private
 */
u2f.getIosPort_ = function (callback) {
    setTimeout(function () {
        callback(new u2f.WrappedIosPort_());
    }, 0);
};

/**
 * A wrapper for chrome.runtime.Port that is compatible with MessagePort.
 * @param {Port} port
 * @constructor
 * @private
 */
u2f.WrappedChromeRuntimePort_ = function (port) {
    this.port_ = port;
};

/**
 * Format and return a sign request compliant with the JS API version supported by the extension.
 * @param {Array<u2f.SignRequest>} signRequests
 * @param {number} timeoutSeconds
 * @param {number} reqId
 * @return {Object}
 */
u2f.formatSignRequest_ =
    function (appId, challenge, registeredKeys, timeoutSeconds, reqId) {
        if (js_api_version === undefined || js_api_version < 1.1) {
            // Adapt request to the 1.0 JS API
            var signRequests = [];
            for (var i = 0; i < registeredKeys.length; i++) {
                signRequests[i] = {
                    version: registeredKeys[i].version,
                    challenge: challenge,
                    keyHandle: registeredKeys[i].keyHandle,
                    appId: appId
                };
            }
            return {
                type: u2f.MessageTypes.U2F_SIGN_REQUEST,
                signRequests: signRequests,
                timeoutSeconds: timeoutSeconds,
                requestId: reqId
            };
        }
        // JS 1.1 API
        return {
            type: u2f.MessageTypes.U2F_SIGN_REQUEST,
            appId: appId,
            challenge: challenge,
            registeredKeys: registeredKeys,
            timeoutSeconds: timeoutSeconds,
            requestId: reqId
        };
    };

/**
 * Format and return a register request compliant with the JS API version supported by the extension..
 * @param {Array<u2f.SignRequest>} signRequests
 * @param {Array<u2f.RegisterRequest>} signRequests
 * @param {number} timeoutSeconds
 * @param {number} reqId
 * @return {Object}
 */
u2f.formatRegisterRequest_ =
    function (appId, registeredKeys, registerRequests, timeoutSeconds, reqId) {
        if (js_api_version === undefined || js_api_version < 1.1) {
            // Adapt request to the 1.0 JS API
            for (var i = 0; i < registerRequests.length; i++) {
                registerRequests[i].appId = appId;
            }
            var signRequests = [];
            for (var i = 0; i < registeredKeys.length; i++) {
                signRequests[i] = {
                    version: registeredKeys[i].version,
                    challenge: registerRequests[0],
                    keyHandle: registeredKeys[i].keyHandle,
                    appId: appId
                };
            }
            return {
                type: u2f.MessageTypes.U2F_REGISTER_REQUEST,
                signRequests: signRequests,
                registerRequests: registerRequests,
                timeoutSeconds: timeoutSeconds,
                requestId: reqId
            };
        }
        // JS 1.1 API
        return {
            type: u2f.MessageTypes.U2F_REGISTER_REQUEST,
            appId: appId,
            registerRequests: registerRequests,
            registeredKeys: registeredKeys,
            timeoutSeconds: timeoutSeconds,
            requestId: reqId
        };
    };

async function digestMessage(message) {
    const msgUint8 = new TextEncoder().encode(message);                           // encode as (utf-8) Uint8Array
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);           // hash the message
    const hashArray = Array.from(new Uint8Array(hashBuffer));                     // convert buffer to byte array
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
    return hashHex;
}

/**
 * Posts a message on the underlying channel.
 * @param {Object} message
 */
u2f.WrappedChromeRuntimePort_.prototype.postMessage = function (message) {
    this.port_.postMessage(message);
};


/**
 * Emulates the HTML 5 addEventListener interface. Works only for the
 * onmessage event, which is hooked up to the chrome.runtime.Port.onMessage.
 * @param {string} eventName
 * @param {function({data: Object})} handler
 */
u2f.WrappedChromeRuntimePort_.prototype.addEventListener =
    function (eventName, handler) {
        var name = eventName.toLowerCase();
        if (name == 'message' || name == 'onmessage') {
            this.port_.onMessage.addListener(function (message) {
                // Emulate a minimal MessageEvent object
                handler({ 'data': message });
            });
        } else {
            console.error('WrappedChromeRuntimePort only supports onMessage');
        }
    };

/**
 * Wrap the Authenticator app with a MessagePort interface.
 * @constructor
 * @private
 */
u2f.WrappedAuthenticatorPort_ = function () {
    this.requestId_ = -1;
    this.requestObject_ = null;
}

/**
 * Launch the Authenticator intent.
 * @param {Object} message
 */
u2f.WrappedAuthenticatorPort_.prototype.postMessage = function (message) {
    var intentUrl =
        u2f.WrappedAuthenticatorPort_.INTENT_URL_BASE_ +
        ';S.request=' + encodeURIComponent(JSON.stringify(message)) +
        ';end';
    document.location = intentUrl;
};

/**
 * Tells what type of port this is.
 * @return {String} port type
 */
u2f.WrappedAuthenticatorPort_.prototype.getPortType = function () {
    return "WrappedAuthenticatorPort_";
};


/**
 * Emulates the HTML 5 addEventListener interface.
 * @param {string} eventName
 * @param {function({data: Object})} handler
 */
u2f.WrappedAuthenticatorPort_.prototype.addEventListener = function (eventName, handler) {
    var name = eventName.toLowerCase();
    if (name == 'message') {
        var self = this;
        /* Register a callback to that executes when
         * chrome injects the response. */
        window.addEventListener(
            'message', self.onRequestUpdate_.bind(self, handler), false);
    } else {
        console.error('WrappedAuthenticatorPort only supports message');
    }
};

/**
 * Callback invoked  when a response is received from the Authenticator.
 * @param function({data: Object}) callback
 * @param {Object} message message Object
 */
u2f.WrappedAuthenticatorPort_.prototype.onRequestUpdate_ =
    function (callback, message) {
        var messageObject = JSON.parse(message.data);
        var intentUrl = messageObject['intentURL'];

        var errorCode = messageObject['errorCode'];
        var responseObject = null;
        if (messageObject.hasOwnProperty('data')) {
            responseObject = /** @type {Object} */ (
                JSON.parse(messageObject['data']));
        }

        callback({ 'data': responseObject });
    };

/**
 * Base URL for intents to Authenticator.
 * @const
 * @private
 */
u2f.WrappedAuthenticatorPort_.INTENT_URL_BASE_ =
    'intent:#Intent;action=com.google.android.apps.authenticator.AUTHENTICATE';

/**
 * Wrap the iOS client app with a MessagePort interface.
 * @constructor
 * @private
 */
u2f.WrappedIosPort_ = function () { };

/**
 * Launch the iOS client app request
 * @param {Object} message
 */
u2f.WrappedIosPort_.prototype.postMessage = function (message) {
    var str = JSON.stringify(message);
    var url = "u2f://auth?" + encodeURI(str);
    location.replace(url);
};

/**
 * Tells what type of port this is.
 * @return {String} port type
 */
u2f.WrappedIosPort_.prototype.getPortType = function () {
    return "WrappedIosPort_";
};

/**
 * Emulates the HTML 5 addEventListener interface.
 * @param {string} eventName
 * @param {function({data: Object})} handler
 */
u2f.WrappedIosPort_.prototype.addEventListener = function (eventName, handler) {
    var name = eventName.toLowerCase();
    if (name !== 'message') {
        console.error('WrappedIosPort only supports message');
    }
};

/**
 * Sets up an embedded trampoline iframe, sourced from the extension.
 * @param {function(MessagePort)} callback
 * @private
 */
u2f.getIframePort_ = function (callback) {
    // Create the iframe
    var iframeOrigin = 'chrome-extension://' + u2f.EXTENSION_ID;
    var iframe = document.createElement('iframe');
    iframe.src = iframeOrigin + '/u2f-comms.html';
    iframe.setAttribute('style', 'display:none');
    document.body.appendChild(iframe);

    var channel = new MessageChannel();
    var ready = function (message) {
        if (message.data == 'ready') {
            channel.port1.removeEventListener('message', ready);
            callback(channel.port1);
        } else {
            console.error('First event on iframe port was not "ready"');
        }
    };
    channel.port1.addEventListener('message', ready);
    channel.port1.start();

    iframe.addEventListener('load', function () {
        // Deliver the port to the iframe and initialize
        iframe.contentWindow.postMessage('init', iframeOrigin, [channel.port2]);
    });
};


//High-level JS API

/**
 * Default extension response timeout in seconds.
 * @const
 */
u2f.EXTENSION_TIMEOUT_SEC = 30;

/**
 * A singleton instance for a MessagePort to the extension.
 * @type {MessagePort|u2f.WrappedChromeRuntimePort_}
 * @private
 */
u2f.port_ = null;

/**
 * Callbacks waiting for a port
 * @type {Array<function((MessagePort|u2f.WrappedChromeRuntimePort_))>}
 * @private
 */
u2f.waitingForPort_ = [];

/**
 * A counter for requestIds.
 * @type {number}
 * @private
 */
u2f.reqCounter_ = 0;

/**
 * A map from requestIds to client callbacks
 * @type {Object.<number,(function((u2f.Error|u2f.RegisterResponse))
 *                       |function((u2f.Error|u2f.SignResponse)))>}
 * @private
 */
u2f.callbackMap_ = {};

/**
 * Creates or retrieves the MessagePort singleton to use.
 * @param {function((MessagePort|u2f.WrappedChromeRuntimePort_))} callback
 * @private
 */
u2f.getPortSingleton_ = function (callback) {
    if (u2f.port_) {
        callback(u2f.port_);
    } else {
        if (u2f.waitingForPort_.length == 0) {
            u2f.getMessagePort(function (port) {
                u2f.port_ = port;
                u2f.port_.addEventListener('message',
            /** @type {function(Event)} */(u2f.responseHandler_));

                // Careful, here be async callbacks. Maybe.
                while (u2f.waitingForPort_.length)
                    u2f.waitingForPort_.shift()(u2f.port_);
            });
        }
        u2f.waitingForPort_.push(callback);
    }
};

/**
 * Handles response messages from the extension.
 * @param {MessageEvent.<u2f.Response>} message
 * @private
 */
u2f.responseHandler_ = function (message) {
    var response = message.data;
    var reqId = response['requestId'];
    if (!reqId || !u2f.callbackMap_[reqId]) {
        console.error('Unknown or missing requestId in response.');
        return;
    }
    var cb = u2f.callbackMap_[reqId];
    delete u2f.callbackMap_[reqId];
    console.log('u2f.responseHandler', response)
    cb(response['responseData']);
};

/**
 * Dispatches an array of sign requests to available U2F tokens.
 * If the JS API version supported by the extension is unknown, it first sends a
 * message to the extension to find out the supported API version and then it sends
 * the sign request.
 * @param {string=} appId
 * @param {string=} challenge
 * @param {Array<u2f.RegisteredKey>} registeredKeys
 * @param {function((u2f.Error|u2f.SignResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.sign = function (appId, challenge, registeredKeys, callback, opt_timeoutSeconds) {
    if (js_api_version === undefined) {
        // Send a message to get the extension to JS API version, then send the actual sign request.
        u2f.getApiVersion(
            function (response) {
                js_api_version = response['js_api_version'] === undefined ? 0 : response['js_api_version'];
                u2f.sendSignRequest(appId, challenge, registeredKeys, callback, opt_timeoutSeconds);
            });
    } else {
        // We know the JS API version. Send the actual sign request in the supported API version.
        u2f.sendSignRequest(appId, challenge, registeredKeys, callback, opt_timeoutSeconds);
    }
};

/**
 * Dispatches an array of sign requests to available U2F tokens.
 * @param {string=} appId
 * @param {string=} challenge
 * @param {Array<u2f.RegisteredKey>} registeredKeys
 * @param {function((u2f.Error|u2f.SignResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.sendSignRequest = function (appId, challenge, registeredKeys, callback, opt_timeoutSeconds) {
    u2f.getPortSingleton_(function (port) {
        var reqId = ++u2f.reqCounter_;
        u2f.callbackMap_[reqId] = callback;
        var timeoutSeconds = (typeof opt_timeoutSeconds !== 'undefined' ?
            opt_timeoutSeconds : u2f.EXTENSION_TIMEOUT_SEC);
        var req = u2f.formatSignRequest_(appId, challenge, registeredKeys, timeoutSeconds, reqId);
        port.postMessage(req);
    });
};

/**
 * Dispatches register requests to available U2F tokens. An array of sign
 * requests identifies already registered tokens.
 * If the JS API version supported by the extension is unknown, it first sends a
 * message to the extension to find out the supported API version and then it sends
 * the register request.
 * @param {string=} appId
 * @param {Array<u2f.RegisterRequest>} registerRequests
 * @param {Array<u2f.RegisteredKey>} registeredKeys
 * @param {function((u2f.Error|u2f.RegisterResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.register = function (appId, registerRequests, registeredKeys, callback, opt_timeoutSeconds) {
    if (js_api_version === undefined) {
        // Send a message to get the extension to JS API version, then send the actual register request.
        u2f.getApiVersion(
            function (response) {
                js_api_version = response['js_api_version'] === undefined ? 0 : response['js_api_version'];
                u2f.sendRegisterRequest(appId, registerRequests, registeredKeys,
                    callback, opt_timeoutSeconds);
            });
    } else {
        // We know the JS API version. Send the actual register request in the supported API version.
        u2f.sendRegisterRequest(appId, registerRequests, registeredKeys,
            callback, opt_timeoutSeconds);
    }
};

/**
 * Dispatches register requests to available U2F tokens. An array of sign
 * requests identifies already registered tokens.
 * @param {string=} appId
 * @param {Array<u2f.RegisterRequest>} registerRequests
 * @param {Array<u2f.RegisteredKey>} registeredKeys
 * @param {function((u2f.Error|u2f.RegisterResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.sendRegisterRequest = function (appId, registerRequests, registeredKeys, callback, opt_timeoutSeconds) {
    u2f.getPortSingleton_(function (port) {
        var reqId = ++u2f.reqCounter_;
        u2f.callbackMap_[reqId] = callback;
        var timeoutSeconds = (typeof opt_timeoutSeconds !== 'undefined' ?
            opt_timeoutSeconds : u2f.EXTENSION_TIMEOUT_SEC);
        var req = u2f.formatRegisterRequest_(
            appId, registeredKeys, registerRequests, timeoutSeconds, reqId);
        console.log('u2f.register: request going in...', req)
        port.postMessage(req);
    });
};


/**
 * Dispatches a message to the extension to find out the supported
 * JS API version.
 * If the user is on a mobile phone and is thus using Google Authenticator instead
 * of the Chrome extension, don't send the request and simply return 0.
 * @param {function((u2f.Error|u2f.GetJsApiVersionResponse))} callback
 * @param {number=} opt_timeoutSeconds
 */
u2f.getApiVersion = function (callback, opt_timeoutSeconds) {
    u2f.getPortSingleton_(function (port) {
        // If we are using Android Google Authenticator or iOS client app,
        // do not fire an intent to ask which JS API version to use.
        if (port.getPortType) {
            var apiVersion;
            switch (port.getPortType()) {
                case 'WrappedIosPort_':
                case 'WrappedAuthenticatorPort_':
                    apiVersion = 1.1;
                    break;

                default:
                    apiVersion = 0;
                    break;
            }
            callback({ 'js_api_version': apiVersion });
            return;
        }
        var reqId = ++u2f.reqCounter_;
        u2f.callbackMap_[reqId] = callback;
        var req = {
            type: u2f.MessageTypes.U2F_GET_API_VERSION_REQUEST,
            timeoutSeconds: (typeof opt_timeoutSeconds !== 'undefined' ?
                opt_timeoutSeconds : u2f.EXTENSION_TIMEOUT_SEC),
            requestId: reqId
        };
        port.postMessage(req);
    });
};

