Vue.component("key-create", {
    template: `<v-dialog v-model="dialog" max-width="600" persistent>
  <v-stepper v-model="step" vertical>
    <v-stepper-step :complete="step > 1" step="1">
      Plug in and pair the new key
      <small>Plug in the new key and select it. Don't unplug your admin key!</small>
    </v-stepper-step>

    <v-stepper-content step="1">
      <v-btn color="primary" @click="pair()">Pair Key</v-btn>
      <v-btn flat @click="cancel()">Cancel </v-btn>
    </v-stepper-content>

    <v-stepper-step :complete="step > 2" step="2">
      Choose the username/uid for this key
      <small>You can associate both if your identity system uses both. At least one is required.</small>
    </v-stepper-step>

    <v-stepper-content step="2">
      <v-form>
        <v-text-field prepend-icon="person" name="uid" label="uid" v-model="uid" type="text"></v-text-field>
      </v-form>
      <v-alert v-model="identityInvalid" type="error">
        A uid is required
      </v-alert>
      <v-btn color="primary" @click="validateIdentities()">Continue</v-btn>
      <v-btn flat @click="cancel()">Cancel </v-btn>
    </v-stepper-content>

    <v-stepper-step :complete="step > 3" step="3">
      Write the key and update the authentication service
      <small>Once written, the key is locked.</small>
    </v-stepper-step>

    <v-stepper-content step="3">
      <v-alert v-model="writeInvalid" type="error">
        An error occurred updating the service and/or the key:<br><br>
        {{ writeError }}
      </v-alert>
      <v-btn v-if="!writeInvalid" color="primary" @click="writeKey()">Finalize</v-btn>
      <v-btn flat @click="cancel()">Cancel </v-btn>
    </v-stepper-content>

    <v-stepper-step step="4">
      Finish
    </v-stepper-step>

    <v-stepper-content step="4">
      <v-card flat>
        <v-card-title class="title">
            Success!
        </v-card-title>
        <v-card-text>
            It's now safe to remove the key. Don't forget to label it with the user information you supplied.
        </v-card-text>
        <v-card-text>
            <span v-if="uid !== ''"><v-chip label><strong>UID:</strong>&nbsp; {{uid}}</v-chip></span>
        </v-card-text>
      </v-card>            
      <v-btn @click="step = 1">Write Another Key</v-btn>
      <v-btn color="primary" @click="cancel()">Close</v-btn>  
    </v-stepper-content>

  </v-stepper>
</v-dialog>`,
    data() {
        return {
            dialog: false,
            step: 1,
            uid: '',
            identityInvalid: false,
            writeInvalid: false,
            writeError: ''
        }
    },
    watch: {
        step: {
            handler() {
                this.processStep()
            },
            deep: true,
            immediate: true
        }
    },
    created() {
        console.log('adding')
        this.$root.$on('keyCreate', () => {
            this.dialog = true
            this.processStep()
        })
    },
    methods: {
        processStep() {
            switch (this.step) {
                case 1:
                    console.log('plug in/pair new key')
                    break
                case 2:
                    console.log('get uid')
                    break
                case 3:
                    console.log('write the key')
                    break
                case 4:
                    console.log('unplug and label')
                    break
            }
        },
        async pair() {
            let success = await ofteAdmin.pairDevice()
            if (success) {
                ++this.step
            }
        },
        validateIdentities() {
            if (this.uid == '') {
                this.identityInvalid = true
                return
            }
            ++this.step
        },
        async writeKey() {
            var common, private, id
            let base = this.adminAPIEndpoint + '/admin/v1'
            var commonURL = base + '/keys/0'
            var privateURL = base + '/keyset'
            var principalURL = base + '/principals'

            var success = true
            await axios.get(commonURL)
                .then(results => {
                    common = results.data
                })
                .catch(err => {
                    success = false
                    this.writeInvalid = true
                    this.writeError = err
                    console.log('error getting commons', err)
                })
            if (!success) {
                return
            }

            await axios.get(privateURL)
                .then(results => {
                    private = results.data
                })
                .catch(err => {
                    success = false
                    this.writeInvalid = true
                    this.writeError = err
                    console.log('error getting new keyset', err)
                })
            if (!success) {
                return
            }

            await axios.post(principalURL+'/'+this.uid+'/key', private)
                .catch(err => {
                    this.writeInvalid = true
                    this.writeError = err.response.data
                    console.log('error writing to db', err)
                    success = false
                })

            if (!success) {
                return
            }

            success = await ofteAdmin.writeKey(private.keyId, common.keys, private.keys)
            if (!success) {
                // TODO: back out principal+key from DB
                this.writeInvalid = true
                this.writeError = "Error writing to key"
                console.log('error writing to key')
                return
            }
            ++this.step

            // TODO: Use a message here
            this.$parent.reload()
        },
        cancel() {
            this.step = 1
            ofteAdmin.closeDevice()
            this.dialog = false
            this.identityInvalid = false
            this.uid = ''
            this.writeInvalid = false
            this.writeError = ''
        }
    }
})