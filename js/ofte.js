/*
Copyright (c) 2020 Ofte, LLC

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the 'Software'), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

(function (window) {
    'use strict'

    function Ofte() {
        const sessionHeader = 'ofte-sessionid'
        const tokenHeader = 'ofte-accesstoken'

        var impl = {}
        impl.config = {
            authServiceURL: 'https://localhost:2357',   // the URL of your Ofte Auth Service instance, defaults to localhost for testing
            interval: 20000,                            // the interval, in milliseconds, of continuous authentication
            networkTimeout: 10000,                      // the timeout, in millseconds, for network requests
            debug: true                                 // if true, send debugging output to the console
        }

        // sessionID is the session identifer returned from the Ofte auth service
        var sessionID = ''
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
                'username': 'matthew@ofte.io',
                'displayName': 'Matthew McNeely',
                'icon': 'http://img.com/me.jpg'
            }
        */
        impl.getOrCreatePrincipal = function (principalData) {
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, 'POST', impl.config.authServiceURL + '/auth/v1/principals', principalData)
            })
            .then(resp => {
                resp.hasKey = resp.fidoKeys !== null && resp.fidoKeys.length > 0
                return resp
            })
        }

        /*
            registerKey adds a new authenticator to a principal (a person).
        */
        impl.registerKey = async function (username) {
            return new Promise(async (resolve, reject) => {
                await registerFIDOKey(username)
                    .then(authenticator => {
                        broadcastEvent('ofte-key-registered', authenticator)
                        if (!authenticator.isOfteKey) {
                            resolve(authenticator)
                        }
                        return authenticator
                    })
                    .then(async authenticator => {
                        // seems to be needed for chrome u2f to work correctly
                        // when following a CTAP2 request
                        await new Promise(r => setTimeout(r, 350))
                        return authenticator
                    })
                    .then(async authenticator => {
                        return await (registerOfteKey(username))
                    })
                    .then(authenticator => {
                        resolve(authenticator)
                    })
                    .catch(err => {
                        broadcastEvent('ofte-error', err)                        
                        reject(err)
                    })
            })
        }

        /*
            loginKey is a Promise-based function that authenticates a registered username and authenticator. During 
            authentication an assertion is created, which is proof that the user has possession of the private key. 
            This assertion contains a signature created using the private key. The server uses the public key retrieved 
            during registration to verify this signature.

            If the authenticator being logged in is an Ofte key, a CA session will be started.
        */
        impl.loginKey = async function (username) {
            return new Promise(async (resolve, reject) => {
                var result
                await getResponsePromise('GET',
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

                        await getResponsePromise('POST',
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
                        broadcastEvent('ofte-key-authenticated', username)
                        // Start an Ofte CA session
                        if (result.value !== '') {
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
                    .catch(err => {
                        console.log('failed to auth', username, 'error', err)
                        broadcastEvent('ofte-error', err)
                        reject('failed to auth', username, 'error', err)
                    })
            })
        }

        /*
            fetch makes a backend request in which the server must check for the passed session id header
            to ensure the continuous authentication session is active.
        */
        impl.fetch = function (method, url, data, contentType = 'application/json', timeout = impl.config.networkTimeout) {
            if (sessionID === '') {
                throw new Error('SessionID is null')
            }
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, method, url, data, [['Ofte-SessionID', sessionID]], contentType, timeout)
            })
        }

        /*
            fetchStrong makes a backend request but first generating a request token from the continous authentication
            session. It's a more secure form of request.
        */
        impl.fetchStrong = function (method, url, data, contentType = 'application/json', timeout = impl.config.networkTimeout) {
            if (sessionID === '') {
                throw new Error('SessionID is null')
            }

            return new Promise(function (resolve, reject) {

                let t0 = performance.now()
                let callback = function (resp) {
                    let ofteError = ofteU2FError(resp)
                    if (ofteError != '') {
                        throw new Error(ofteError)
                    }
                    var request = new XMLHttpRequest();
                    request.open('POST', impl.config.authServiceURL + '/auth/v1/finish_ofte_access/' + sessionID, true);
                    request.setRequestHeader('Content-Type', 'application/json;');

                    request.onload = async function () {
                        if (this.status == 200) {
                            resetTimer(sessionID)
                            let token = this.getResponseHeader('Ofte-AccessToken')
                            await getResponse(resolve, reject, method, url, data, [['Ofte-SessionID', sessionID], ['Ofte-AccessToken', token]], contentType, timeout)
                                .then(() => {
                                    if (impl.config.debug) {
                                        console.log('fetchStrong took ' + (performance.now() - t0) + ' milliseconds');
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
                request.open('GET', impl.config.authServiceURL + '/auth/v1/start_ofte_access/' + sessionID, true);

                request.onload = function () {
                    if (this.status == 200) {
                        let req = JSON.parse(request.responseText)
                        //u2f.sign(req.appId, req.challenge, req.registeredKeys, callback, 30);
                        u2fApi.u2fSign(req.appId, req.challenge, req.registeredKeys, callback, 10);
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

        /*
            endSession stops the active continuous authentication session.
        */
        impl.endSession = function () {
            stopCA()
            let session = sessionID
            sessionID = ''
            broadcastEvent('ofte-end-session', session)
            return getResponsePromise('POST', impl.config.authServiceURL + '/auth/v1/end_session/' + session)
        }

        // Private functions
        // --------- • ---------

        const status = response => {
            if (response.status >= 200 && response.status < 300) {
                return Promise.resolve(response)
            }
            console.log('error response', response)
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

        async function registerFIDOKey(username) {
            return new Promise(async (resolve, reject) => {

                await getJSONData(ofte.config.authServiceURL + '/auth/v1/start_fido_registration/' + username)
                    .then(credentialCreationOptions => {
                        credentialCreationOptions.publicKey.challenge = bufferDecode(credentialCreationOptions.publicKey.challenge);
                        credentialCreationOptions.publicKey.user.id = bufferDecode(credentialCreationOptions.publicKey.user.id);
                        if (credentialCreationOptions.publicKey.excludeCredentials) {
                            for (var i = 0; i < credentialCreationOptions.publicKey.excludeCredentials.length; i++) {
                                credentialCreationOptions.publicKey.excludeCredentials[i].id = bufferDecode(credentialCreationOptions.publicKey.excludeCredentials[i].id);
                            }
                        }
                        if (impl.debug) {
                            console.log('inbound create options: ', credentialCreationOptions.publicKey);
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
                        return postJSONData(impl.config.authServiceURL + '/auth/v1/finish_fido_registration/' + username, data)
                    })
                    .then(result => {
                        result.isOfteKey = result.certLabel !== undefined && result.certLabel.startsWith('Ofte')
                        resolve(result)
                    })
                    .catch(err => {
                        reject(err)
                    })
            })
        }

        async function registerOfteKey(username) {
            return new Promise(async (resolve, reject) => {
                await getJSONData(ofte.config.authServiceURL + '/auth/v1/start_ofte_registration/' + username)
                    .then(async resp => {
                        if (ofte.config.debug) {
                            console.log('about to ofte register', resp)
                        }
                        return await u2fApi.register(resp.appId, resp.registerRequests, resp.registeredKeys, 10)
                    })
                    .then(async resp => {
                        if (ofte.config.debug) {
                            console.log('about to finish ofte register', resp)
                        }
                        return await postJSONData(ofte.config.authServiceURL + '/auth/v1/finish_ofte_registration/' + username, resp)
                    })
                    .then(resp => {
                        resp.isOfteKey = true
                        resolve(resp)
                    })
                    .catch(err => {
                        reject(err)
                    })
            })
        }

        function getResponsePromise(method, url, data, headers = [], contentType = 'application/json', timeout = impl.config.networkTimeout) {
            return new Promise(function (resolve, reject) {
                getResponse(resolve, reject, method, url, data, headers, contentType, timeout)
            })
        }

        async function getResponse(resolve, reject, method, url, data, headers = [], contentType = 'application/json', timeout = impl.config.networkTimeout) {
            var xhr = new XMLHttpRequest()
            try {
                xhr.open(method, url)
            } catch (e) {
                reject(e)
                return
            }
            xhr.onload = function () {
                if (this.status >= 200 && this.status < 300) {
                    if (xhr.responseText != '') {
                        switch (xhr.getResponseHeader('Content-Type')) {
                            case 'application/json':
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
                xhr.setRequestHeader('Content-Type', contentType)
                switch (contentType) {
                    case 'application/json':
                        if (!hasJSONStructure(data)) {
                            data = JSON.stringify(data);
                        }
                        break;
                    case 'arraybuffer':
                        xhr.responseType = 'arraybuffer'
                }
            }
            xhr.timeout = timeout
            for (let i = 0; i < headers.length; i++) {
                xhr.setRequestHeader(headers[i][0], headers[i][1])
            }
            xhr.send(data)
        }

        function ofteAssert() {
            if (sessionID === '') {
                throw new Error('SessionID is nil')
            }

            let callback = function (resp) {
                let ofteError = ofteU2FError(resp)
                if (ofteError != '') {
                    throw new Error(ofteError)
                }
                var request = new XMLHttpRequest();
                request.open('POST', impl.config.authServiceURL + '/auth/v1/finish_ofte_assert/' + sessionID, true);
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
            request.open('GET', impl.config.authServiceURL + '/auth/v1/start_ofte_assert/' + sessionID, true);

            request.onload = function () {
                if (this.status == 200) {
                    let req = JSON.parse(request.responseText)
                    //u2f.sign(req.appId, req.challenge, req.registeredKeys, callback, 30);
                    u2fApi.u2fSign(req.appId, req.challenge, req.registeredKeys, callback, 10);
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
                return '';
            }
            if (resp.errorCode === u2f.ErrorCodes['OK']) {
                return '';
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
            if (ofte.config.debug) {
                console.log('CTAP1/Ofte Error:', msg)
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
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');;
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

        // TODO: update this
        window.onbeforeunload = function () {
            try {
                if (sessionID != '') {
                    var xhr = new XMLHttpRequest()
                    xhr.open('DELETE', window.ofte.config.serviceURL + '/s/' + sessionID, false)
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

            this.addEventListener('message', function (evt) {
                var data = evt.data

                switch (data.command) {
                    case 'setTimeout':
                        var time = parseInt(data.timeout || 0, 10),
                            timer = setTimeout(fireTimeout.bind(null, data.id), time)
                        timers[data.id] = timer
                        break
                    case 'clearTimeout':
                        var timer = timers[data.id]
                        if (timer) clearTimeout(timer)
                        delete timers[data.id]
                }
            })
        }

        var timeoutId = 0
        var timeouts = {}
        let worker = new Worker(URL.createObjectURL(new Blob(['(' + workerBlob.toString() + ')()'], { type: 'text/javascript' })))

        worker.addEventListener('message', function (evt) {
            var data = evt.data,
                id = data.id,
                fn = timeouts[id].fn,
                args = timeouts[id].args

            fn.apply(null, args)
            delete timeouts[id]
        });

        // overrides the native setTimeout function
        window.setTimeout = function (fn, delay) {
            var args = Array.prototype.slice.call(arguments, 2)
            timeoutId += 1
            delay = delay || 0
            var id = timeoutId
            timeouts[id] = { fn: fn, args: args }
            worker.postMessage({ command: 'setTimeout', id: id, timeout: delay })
            return id
        };

        // override the native clearTimeout function
        window.clearTimeout = function (id) {
            worker.postMessage({ command: 'clearTimeout', id: id })
            delete timeouts[id]
        };

        return impl
    }

    if (typeof (window.ofte) === 'undefined') {
        window.ofte = Ofte()

        var scripts = document.getElementsByTagName('script');
        var lastScript = scripts[scripts.length - 1];
        window.ofte.config = {
            authServiceURL: lastScript.getAttribute('data-auth-service-url') ? lastScript.getAttribute('data-auth-service-url') : window.ofte.config.authServiceURL,
            interval: parseInt(lastScript.getAttribute('data-interval') ? lastScript.getAttribute('data-interval') : window.ofte.config.interval),
            networkTimeout: parseInt(lastScript.getAttribute('data-network-timeout') ? lastScript.getAttribute('data-network-timeout') : window.ofte.config.networkTimeout),
            debug: lastScript.getAttribute('data-debug') ? (lastScript.getAttribute('data-debug') == 'true') : window.ofte.config.debug
        }
        // TODO: validate passed config variables

        if (window.ofte.config.authServiceURL === undefined) {
            let msg = 'Ofte Error: the auth service URL is undefined. See https://ofte.io/todo.html for configuration help'
            console.log(msg)
            throw new Error(msg)
        }

        fetch(window.ofte.config.authServiceURL + '/auth/v1/version')
            .then((response) => response.text())
            .then((data) => {
                if (window.ofte.config.debug) {
                    console.log(data)
                }
            })
            .catch((err) => {
                console.log('Ofte Error: error connecting to Ofte Auth Service ' + window.ofte.config.authServiceURL, err)
            })
    }

})(window);


//Copyright 2014-2015 Google Inc. All rights reserved.

//Use of this source code is governed by a BSD-style
//license that can be found in the LICENSE file or at
//https://developers.google.com/open-source/licenses/bsd

(function () {
    'use strict';

    //Copyright 2014-2015 Google Inc. All rights reserved.

    //Use of this source code is governed by a BSD-style
    //license that can be found in the LICENSE file or at
    //https://developers.google.com/open-source/licenses/bsd

    /**
     * @fileoverview The U2F api.
     */
    // 'use strict';


    /**
     * Namespace for the U2F api.
     * @type {Object}
     */
    var u2f = u2f || {};

    const chromeApi = u2f; // Adaptation for u2f-api package

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
        return ['iPhone', 'iPad', 'iPod'].indexOf(navigator.platform) > -1;
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
    };

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
        return 'WrappedAuthenticatorPort_';
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
        var url = 'u2f://auth?' + encodeURI(str);
        location.replace(url);
    };

    /**
     * Tells what type of port this is.
     * @return {String} port type
     */
    u2f.WrappedIosPort_.prototype.getPortType = function () {
        return 'WrappedIosPort_';
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
        cb(response['responseData']);
    };

    /**
     * Calls the callback with true or false as first and only argument
     * @param {Function} callback
     */
    u2f.isSupported = function (callback) {
        var hasCalledBack = false;
        function reply(value) {
            if (hasCalledBack)
                return;
            hasCalledBack = true;
            callback(value);
        }
        u2f.getApiVersion(
            function (response) {
                js_api_version = response['js_api_version'] === undefined ? 0 : response['js_api_version'];
                reply(true);
            }
        );
        // No response from extension within 1500ms -> no support
        setTimeout(reply.bind(null, false), 1500);
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

    // Feature detection (yes really)
    // For IE and Edge detection, see https://stackoverflow.com/questions/31757852#31757969
    // and https://stackoverflow.com/questions/56360225#56361977
    var isBrowser = (typeof navigator !== 'undefined') && !!navigator.userAgent;
    var isSafari = isBrowser && navigator.userAgent.match(/Safari\//)
        && !navigator.userAgent.match(/Chrome\//);
    var isEDGE = isBrowser && /(Edge\/)|(edg\/)/i.test(navigator.userAgent);
    var isIE = isBrowser && /(MSIE 9|MSIE 10|rv:11.0)/i.test(navigator.userAgent);
    var _backend = null;
    function getBackend() {
        if (_backend)
            return _backend;
        var supportChecker = new Promise(function (resolve, reject) {
            function notSupported() {
                resolve({ u2f: null });
            }
            if (!isBrowser)
                return notSupported();
            if (isSafari)
                // Safari doesn't support U2F, and the Safari-FIDO-U2F
                // extension lacks full support (Multi-facet apps), so we
                // block it until proper support.
                return notSupported();
            var hasNativeSupport = (typeof window.u2f !== 'undefined') &&
                (typeof window.u2f.sign === 'function');
            if (hasNativeSupport)
                return resolve({ u2f: window.u2f });
            //if (isEDGE || isIE)
            if (isIE)
                // We don't want to check for Google's extension hack on EDGE & IE
                // as it'll cause trouble (popups, etc)
                return notSupported();
            if (location.protocol === 'http:')
                // U2F isn't supported over http, only https
                return notSupported();
            if (typeof MessageChannel === 'undefined')
                // Unsupported browser, the chrome hack would throw
                return notSupported();
            // Test for google extension support
            chromeApi.isSupported(function (ok) {
                if (ok)
                    resolve({ u2f: chromeApi });
                else
                    notSupported();
            });
        })
            .then(function (response) {
                _backend = response.u2f ? supportChecker : null;
                return response;
            });
        return supportChecker;
    }
    var ErrorCodes = {
        OK: 0,
        OTHER_ERROR: 1,
        BAD_REQUEST: 2,
        CONFIGURATION_UNSUPPORTED: 3,
        DEVICE_INELIGIBLE: 4,
        TIMEOUT: 5
    };
    var ErrorNames = {
        '0': 'OK',
        '1': 'OTHER_ERROR',
        '2': 'BAD_REQUEST',
        '3': 'CONFIGURATION_UNSUPPORTED',
        '4': 'DEVICE_INELIGIBLE',
        '5': 'TIMEOUT'
    };
    function makeError(msg, err) {
        var code = err != null ? err.errorCode : 1; // Default to OTHER_ERROR
        var type = ErrorNames[('' + code)];
        var error = new Error(msg);
        error.metaData = { type: type, code: code };
        return error;
    }
    function isSupported() {
        return getBackend()
            .then(function (backend) { return !!backend.u2f; });
    }
    function _ensureSupport(backend) {
        if (!backend.u2f) {
            if (location.protocol === 'http:')
                throw new Error('U2F is not supported over http, only https');
            throw new Error('U2F not supported');
        }
    }
    function ensureSupport() {
        return getBackend()
            .then(_ensureSupport);
    }
    function arrayify(value) {
        if (value != null && Array.isArray(value))
            return value;
        return value == null
            ? []
            : Array.isArray(value)
                ? value.slice() : [value];
    }
    function register(appId, registerRequests, signRequests, timeout) {
        var _registerRequests = arrayify(registerRequests);
        if (typeof signRequests === 'number' && typeof timeout === 'undefined') {
            timeout = signRequests;
            signRequests = [];
        }
        var _signRequests = arrayify(signRequests);
        return getBackend()
            .then(function (backend) {
                _ensureSupport(backend);
                var u2f = backend.u2f;
                return new Promise(function (resolve, reject) {
                    function callback(response) {
                        console.log('u2f register, in callback', response)
                        if (response.errorCode)
                            reject(makeError('Registration failed', response));
                        else {
                            delete response.errorCode;
                            resolve(response);
                        }
                    }
                    //var appId = _registerRequests[0].appId;
                    //console.log('u2f register, request inbound', _registerRequests, _signRequests)
                    u2f.register(appId, _registerRequests, _signRequests, callback, timeout);
                });
            });
    }
    function sign(appId, signRequests, timeout) {
        debugger
        var _signRequests = arrayify(signRequests);
        return getBackend()
            .then(function (backend) {
                _ensureSupport(backend);
                var u2f = backend.u2f;
                return new Promise(function (resolve, reject) {
                    var _a;
                    function callback(response) {
                        if (response.errorCode)
                            reject(makeError('Sign failed', response));
                        else {
                            delete response.errorCode;
                            resolve(response);
                        }
                    }
                    var challenge = _signRequests[0].challenge;
                    var registeredKeys = (_a = []).concat.apply(_a, _signRequests
                        .map(function (_a) {
                            var version = _a.version, keyHandle = _a.keyHandle, appId = _a.appId;
                            return arrayify(keyHandle)
                                .map(function (keyHandle) {
                                    return ({ version: version, keyHandle: keyHandle, appId: appId });
                                });
                        }));
                    u2f.sign(appId, challenge, registeredKeys, callback, timeout);
                });
            });
    }

    var u2fApi = /*#__PURE__*/Object.freeze({
        ErrorCodes: ErrorCodes,
        ErrorNames: ErrorNames,
        isSupported: isSupported,
        ensureSupport: ensureSupport,
        register: register,
        sign: sign,
        u2fSign: u2f.sign
    });

    window.u2fApi = u2fApi;
}());
