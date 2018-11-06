# Ofte Developer Resources

This repository is the home for

1. The official, sematically versioned Ofte Javascript library (ofte.js)
2. Javascript examples of Ofte integration into various frameworks
3. Examples of server-side calls to Ofte services for various Ofte-related validation tasks

This document covers the intricate details of integrating Ofte into your platform. See https://ofte.io for more general information about our continuous authentication platform.

Integrating Ofte into your web application involves two simple steps

1. Load our JS and change access to your protected resources with our Promise-based helper functions
2. In your backend services, make calls to the Ofte platform when necessary 

## Javascript

Ofte uses a Javascript library named `ofte.js` to initialize and communicate with your OfteKeys and our services. You can find the latest ofte.js at our CDN at this url:

```https://glcdn.githack.com/ofte/code/raw/master/js/ofte.js```

You can find specific sematically tagged versions similarly:

```https://glcdn.githack.com/ofte/code/raw/1.0.0/js/ofte.js```

You can load and initialize the Ofte Javascript Library via a normal `<script>` reference.

```javascript
<script src="https://glcdn.githack.com/ofte/code/raw/master/js/ofte.js"></script>
```

#### Configuration
The library exposes a configuration object through which various attributes can be configured:

```javascript
var config = {
    serviceURL: 'https://demo.ofte.io:65443/v1',// the URL of the Ofte Auth Service (dependent on your implementation)
    interval: 1500,                             // the interval, in milliseconds, of continuous authentication
    adaptiveInterval: false,                    // if true, adapt the interval in accordance with network speed
    networkTimeout: 10000,                      // the timeout, in millseconds, for network requests
    autoStart: true,                            // if true, start authenticating as soon as the device is paired/opened
    debug: true                                 // if true, send debugging output to the console
}
```

You can specify these parameters when loading the script by adding `data-<name>` attributes to the `script` tag. For instance, to set the `interval` to 2.5 seconds, you'd issue use this directive:

```javascript
<script src="https://glcdn.githack.com/ofte/code/raw/master/js/ofte.js" data-interval="2500"></script>
```

Here are the <i>data attribute</i> tags and corresponding config attributes:

* serviceURL: data-service-url
* interval: data-interval
* adaptiveInterval: data-adaptive-interval
* networkTimeout: data-network-timeout
* autoStart: data-auto-start
* debug: data-debug



When you load the ofte.js with the default configuration, an Ofte-session starts automatically if the OfteKey is plugged in and paired. If not, an event is delivered to your app at which time you can ask you user to plug in or pair their OfteKey. See the basic html demo for an example. Speaking of events...

#### Events
Ofte uses Javascript events that you can listen for when the state of the Ofte Key or the Services changes. Once our JS library is loaded, you can listen for the following:

```
    ofte.eventDeviceDiscovered // a paired OfteKey has been found
    ofte.eventDeviceNotFound   // no paired OfteKey has been found
    ofte.eventDeviceErred      // the OfteKey encountered an error
    ofte.eventDeviceClosed     // the OfteKey was closed
    ofte.eventDeviceReset      // the OfteKey was reset
    ofte.eventDevicePaired     // the OfteKey was selected from the UI
    ofte.eventDeviceOpened     // the OfteKey was opened
    ofte.eventDevicePlugged    // the OfteKey was physically plugged into the computer
    ofte.eventDeviceUnplugged  // the OfteKey was physically removed
    ofte.eventDeviceInited     // the OfteKey initialized
    ofte.eventDeviceProcessed  // the OfteKey processed a payload
    ofte.eventSvcInited        // the Ofte auth service successfully initialized with a OfteKey
    ofte.eventSvcProcessed     // the Ofte auth service successfully processed an OfteKey round
    ofte.eventSvcKilled        // the Ofte auth service killed the session
    ofte.eventSvcErred         // the Ofte auth service encountered an error
    ofte.eventNetworkErred     // a network error occurred
```

For example, you can redirect to your login page when an OfteKey is unplugged thusly:

```javascript
    ofte.on(ofte.eventDeviceUnplugged, function (event) {
        window.location = 'index.html';
    });
```

#### Ofte-protected Access to (your) Sensitive Data

Once an Ofte session is established between the OfteKey and the Ofte services, you can protect access to your backend's sensitive information by using our Promised-based helper methods. 

Here's an example of a Promised-based call you may already have in your webapp:

```javascript
    axios.get('https://example.com/users')
      .then(res => {
        const persons = res.data;
        this.setState({ persons });
      })
      .catch(err => {
          processError(err);
      })
```

Here's the same call using the Ofte-protected helper functions:

```javascript
    ofte.getJSONResponseAuthorized('GET', 'https://example.com/users')
      .then(res => {
        const persons = res.data;
        this.setState({ persons });
      })
      .catch(err => {
          processError(err);
      })
```

Note that it's just a **one-line change**. The Ofte helper functions extract a one-time token from the OfteKey, places that in the payload in an HTTP Header and then calls your endpoint as normal. It's your responsibility in your backend service to recognize these Headers and hit our services for validatation. We cover this next.

## Backend Services Integration

Protecting your webapp's sensitive data using Ofte is designed to be as painless as possible. In a nutshell, if your frontend is using our helper functions (as described above), in your requests will be Ofte-specific headers that your backend services need to extract and validate with our services. It's a lot less complicated than it sounds. Here's an example in a Golang-based backend service using the popular gin-gonic framework.

Let's say this is your endpoint for a call to get your webapp's users (as illustrated above in JS example):

```golang
func getUsers(ctx *gin.Context) {
    users := someCallToGetUsers()
    ctx.JSON(users)
}

func main() {
    r := gin.Default()
    // Not protected by Ofte
    r.GET("/users", getUsers)
    r.Run()
}
```

Below is an example of simple middleware that checks for Ofte-based HTTP headers. No changes to your existing controllers would be necessary here, just add the middleware code. 

```golang

01  const ofteServicesEndpoint = "https://someurl.where.ofteservices.are.installed.com/v1/t"
02  
03  func ofteMiddleware(ctx *gin.Context) {
04      session := ctx.Request.Header.Get("ofte-session")
05      token := ctx.Request.Header.Get("ofte-token")
06      uid := getPrincipalFromSession(ctx)
07      resp, err := http.PostForm(ofteServiceEndpoint,
08          url.Values{"session": {session}, "token": {token}, "uid": {uid}})  // REST call to our services
09      if err != nil || resp.StatusCode != http.StatusOK {
10          ctx.AbortWithStatus(http.StatusUnauthorized)
12          return
13      }
14  }
15
16  func getUsers(ctx *gin.Context) {
17      users := someCallToGetUsers()
18      ctx.JSON(users)
19  }
20
21  func main() {
22      r := gin.Default()
23      // Protected by Ofte
24      r.GET("/users", ofteMiddleware, getUsers)
25      r.Run()
26  }
```

So the difference here is the addition of that middleware starting on line 3 (which could be used across all your resource endpoints) and the injection of that middleware routine into your handler assignment on line 24.

For Java-based backends, Spring MVC *interceptors* can be used in a similar way to check for HTTP Headers that need to be validated via REST to our services. Other language/environments use similar interceptor/middleware constructs and Ofte would integrate cleanly into those as well. As demand for languages is made known, we'll add libraries for those environments in this repository.

[Let us know](mailto:info@ofte.io) what environments you're interested in working with, and we'll prioritize those. And of course if you have questions, don't hesitate to open an issue or [mail us](mailto:info@ofte.io).