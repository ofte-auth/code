# Ofte Developer Resources

This document covers the intricate details of integrating Ofte into your platform. See https://ofte.io for more general information about our continuous authentication platform.

Integrating Ofte into your web application involves two simple steps

1. Load our JS and change access to your protected resources with our Promise-based helper functions
2. In your backend services, make calls to the Ofte platform when necessary 

## Javascript

Ofte uses a Javascript library named `ofte.js` to initialize and communicate with your OfteKeys and our services. You can find the latest ofte.js at our CDN at this url:

```https://cdn.ofte.io/js/latest/ofte.js``` or ```https://cdn.ofte.io/js/latest/ofte.min.js```


You can load and initialize the Ofte Javascript Library via a normal `<script>` reference.

```javascript
<script src="https://cdn.ofte.io/js/latest/ofte.js"></script>
```

#### Configuration
The library exposes a configuration object through which various attributes can be configured:

```javascript
var config = {
    authServiceURL: 'https://demo.ofte.io:65443/v1',// the URL of the Ofte Auth Service (dependent on your implementation)
    interval: 20000,                            // the interval, in milliseconds, of continuous authentication
    networkTimeout: 10000,                      // the timeout, in millseconds, for network requests
    debug: true                                 // if true, send debugging output to the console
}
```

You can specify these parameters when loading the script by adding `data-<name>` attributes to the `script` tag. For instance, to set the `interval` to 2.5 seconds, you'd issue use this directive:

```javascript
<script src="https://cdn.ofte.io/js/latest/ofte.js" data-interval="10000"></script>
```

Here are the <i>data attribute</i> tags and corresponding config attributes:

* authServiceURL: data-auth-service-url
* interval: data-interval
* adaptiveInterval: data-adaptive-interval
* networkTimeout: data-network-timeout
* autoStart: data-auto-start
* debug: data-debug


#### Principals
The Ofte Services store no private or secure/sensitive information. In order to associate people with Ofte Keys (or vanilla FIDO keys), you need to inform Ofte Services about
the people (Principals) for which you want Ofte to manage keys. This snippet shows this process

```javascript
    let principal = {
        username: 'hdt@walden.org,
        displayName: 'Henry D Thoreau',
        icon: 'https://kbimages1-a.akamaihd.net/e858c45e-a8cb-440c-9fb9-6308282cd3bb/166/300/False/henry-david-thoreau-7.jpg'
    }
    
    ofte.getOrCreatePrincipal(principal)
        .then(resp => {
            console.log('principal', resp)
        })
        .catch(err => {
            console.log('error creating principal', err)
        })
```

Once created or retrieved, a Key can be registered to a Principal

```javascript
ofte.registerKey(principal.username)
    .then(key => {
        console.log('key registered', key)
    })
    .catch(err => {
        console.log('error registering key', err)
    })
```

Then, to login using a Key
```javascript
ofte.loginKey(principal.username)
    .then(resp => {
        console.log('successfully logged in', resp)
    })
    .catch(err => {
        console.log('error loggin in key', err)
    })
```

To protect access to resources in your app by verifying the Ofte CA session is still active

```javascript
ofte.fetch(url)
    .then(resp => {
        console.log('results', resp)
    })
    .catch(err => {
        console.log('error', err)
    })
```

To more strongly protect access to resources in your app by having the Key issue a one-time token

```javascript
ofte.fetchStrong(url)
    .then(resp => {
        console.log('results', resp)
    })
    .catch(err => {
        console.log('error', err)
    })
```

You can see a complete VueJS Single Page App that implments Ofte [here](https://gitlab.com/ofte/example-portal-vuejs-golang/-/tree/ofte-ca).

#### Events
Ofte uses Javascript events that you can listen for when the state of the Ofte Key or the Services changes. Once our JS library is loaded, you can listen for the following:

```
    ofte-key-registered         // a FIDO key, possibly an Ofte Key, has been registered. The payload will be object representing the key
    ofte-key-authenticated      // a FIDO key, possibly an Ofte Key, has been authenticated (logged in). The payload will be the principal's username
    ofte-session-start          // An Ofte Key has been authenticated and a CA session has started. The payload will be the session identifier
    ofte-fetch                  // An Ofte Key has been used to fetch a URL. The payload will be the URL
    ofte-fetch-strong           // An Ofte Key has been used to fetch a URL using a one-time token generated by the Key. The payload will be the URL
    ofte-end-session            // A Ofte CA Session has been ended. The payload will be the session identifier
    ofte-key-assert             // A Ofte CA Session has been kept alive. The payload will be the session identifier
    ofte-error                  // an error has occured. The payload will be the error
```

## Backend Services Integration

Protecting your webapp's sensitive data using Ofte is designed to be as painless as possible. In a nutshell, if your frontend is using our helper functions (as described above), in your requests will be Ofte-specific headers that your backend services need to extract and validate with our services. It's a lot less complicated than it sounds. Here's an example in a Golang-based backend service using the popular gin-gonic framework.

Let's say this is your endpoint for a call to get your webapp's users

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

Here's an example of using our golang Gin middleware to protect resources

```golang
import (
    ...
    "gitlab.com/ofte/code/api/golang/middleware/ofte"
    ...
)

const ofteServicesEndpoint = "https://someurl.where.ofteservices.are.installed.com:2357/auth/v1"

func getUsers(ctx *gin.Context) {
    users := someCallToGetUsers()
    ctx.JSON(users)
}

func main() {
    r := gin.Default()
    // Protected by Ofte CA
    r.GET("/users", ofte.GinSessionAuthMiddleware(ofteServicesEndpoint), getUsers)
    r.Run()
}
```

For Java-based backends, Spring MVC *interceptors* can be used in a similar way to check for HTTP Headers that need to be validated via REST to our services. Other language/environments use similar interceptor/middleware constructs and Ofte would integrate cleanly into those as well. As demand for languages is made known, we'll add libraries for those environments in this repository.

[Let us know](mailto:info@ofte.io) what environments you're interested in working with, and we'll prioritize those. And of course if you have questions, don't hesitate to open an issue or [mail us](mailto:info@ofte.io).

#### Admin REST
Ofte Services includes a REST API with which you can manage principals and keys that Ofte is controlling. There are options to manage keys by AAGUID as well.

An example application that uses this API can be reviewed in /example/admin.
