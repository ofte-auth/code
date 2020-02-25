var adminLogin = Vue.component("Login", {
    template: `
    <v-dialog v-model="dialog" persistent max-width="500px">
        <v-card class="elevation-12">
            <v-toolbar dark color="primary">
                <v-toolbar-title>Admin Login</v-toolbar-title>
                <v-spacer></v-spacer>
            </v-toolbar>
            <v-card-text>
                <v-form ref="form">
                    <v-text-field prepend-icon="person" name="login" 
                        label="Email" v-model="email" type="text" required></v-text-field>
                    <v-text-field prepend-icon="lock" name="password" label="Password" id="password" 
                        v-model="password" type="password" required></v-text-field>
                </v-form>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn @click="login" color="primary">Login</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
  `,
    $_veeValidate: {
        validator: "new"
    },
    data() {
        return {
            email: null,
            password: null,
            errorMsg: '',
            mode: 'login',
            dialog: true
        }
    },
    created() {
        console.log('v', this.fields.all)
    },
    methods: {
        login() {
            console.log('Login', this.email, this.password)
            /*
            if (this.mode == 'login') {
                this.errorMsg = ''
                console.log("login");
                fbAuth.signInWithEmailAndPassword(this.email, this.password).catch(error => {
                    console.log(error)
                    this.errorMsg = error.message
                    fbAuth.signOut().then(function () { }).catch(function (error) {
                        this.errorMsg += error.message
                        // An error happened.
                    });
                }).then(
                    user => {
                        console.log('then', user)
                        if (user) this.$router.push('/')
                    }
                )
            } else {
                fbAuth.createUserWithEmailAndPassword(this.email, this.password).catch(error => {
                    this.errorMsg = error.message + ' ' + error.code;
                }).then(user => {
                    if (user) this.$router.push('/')
                });
            }
            */
        }
    }
});