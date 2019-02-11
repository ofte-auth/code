var portalLogin = Vue.component("Login", {
    template: `<v-dialog v-model="dialog" persistent max-width="500px">
    <v-card class="elevation-12">
        <v-toolbar dark color="primary">
            <v-toolbar-title>Ofte Portal Login</v-toolbar-title>
            <v-spacer></v-spacer>
        </v-toolbar>
        <v-card-text>
            <v-stepper v-model="step" vertical>
                <v-stepper-step :complete="step > 1" step="1">
                    Sign in using Google Authentication
                    <small>We'll let Google manage our authentication. Choose your @ofte.io email address.</small>
                </v-stepper-step>
                <v-stepper-content step="1">
                    <g-signin-button :params="googleSignInParams" 
                        @success="onSignInSuccess" 
                        @error="onSignInError">
                    </g-signin-button>
                </v-stepper-content>

                <v-stepper-step :complete="step > 2" step="2">
                    Plug in/Pair Your Assigned OfteKey
                    <small>You only need to pair your OfteKey once.</small>
                </v-stepper-step>
                <v-stepper-content step="2">
                    <div v-if="!isPaired()">
                    <img id="notfoundbug" v-if="!paired"
                        src="img/notfoundbug.png" 
                        style="cursor: pointer;" 
                        v-on:click="pairDevice" />
                    </div>
                    <div v-else>
                    <v-progress-linear :indeterminate="true"></v-progress-linear>
                    Already paired, initializing session
                    </div>
                </v-stepper-content>

                <v-stepper-step :complete="step > 3" step="3">
                    Authenticate to Portal Server
                </v-stepper-step>
                <v-stepper-content step="3">
                    <v-progress-linear :indeterminate="true"></v-progress-linear>
                    Logging into the Ofte portal...
                </v-stepper-content>
            </v-stepper>
        </v-card-text>
    </v-card>
</v-dialog>`,
    data() {
        return {
            dialog: true,
            paired: false,
            step: 1,
            googleSignInParams: {
                client_id: '964837469726-7jkq59vk4sduo9f6hutt3vdk36ch9n9m.apps.googleusercontent.com'
            }
        }
    },
    watch: {
        paired: function () {
            console.log('watch: this.paired:', this.paired)
        },
        step: function () {
            switch (this.step) {
                case 1:
                    break
                case 2:
                    if (this.paired) {
                        setTimeout(ofte.openDevice, 1000)
                    }
                    break
                case 3:
                    break
            }
        }
    },
    mounted() {
        ofte.on(ofte.eventDeviceDiscovered, this.callbackDeviceDiscovered)
    },
    created() {
        ofte.on(ofte.eventDeviceOpened, this.callbackDeviceOpened)
        ofte.on(ofte.eventDeviceProcessed, this.login)
    },
    destroyed() {
        ofte.off(ofte.eventDeviceDiscovered, this.callbackDeviceDiscovered)
        ofte.off(ofte.eventDeviceOpened, this.callbackDeviceOpened)
        ofte.off(ofte.eventDeviceProcessed, this.login)
    },
    methods: {
        onSignInSuccess(googleUser) {
            this.$root.$data.googleIDToken = googleUser.getAuthResponse().id_token
            this.step = 2
        },
        onSignInError(error) {
            console.log('Error with Google Authentication:', error)
            _this.$root.$data.googleIDToken = ''
            router.push({name: 'error', params: {err: error}})
        },
        pairDevice() {
            ofte.pairDevice()
        },
        login() {
            _this = this
            ofte.off(ofte.eventDeviceProcessed, this.login)
            setTimeout(async function() {
                await ofte.getFormResponseAuthorized("POST",
                _this.$root.$data.portalAPIEndpoint + "?t=" + _this.$root.$data.googleIDToken)
                .then(() => {
                    _this.dialog = false
                    router.push("/")
                })
                .catch((err) => {
                    _this.$root.$data.googleIDToken = ''
                    router.push({name: 'error', params: {err: err}})
                    console.log('Error logging into portal', err)
                })
            }, 500)
        },
        isPaired() {
            return this.paired
        },
        callbackDeviceDiscovered() {
            this.paired = true
            if (this.step === 2) {
                ofte.openDevice()
                this.step = 3
            }
        },
        callbackDeviceOpened() {
            this.step = 3
            setTimeout(function() {
                ofte.startSession()
            }, 500)                        
        }
    }
});
