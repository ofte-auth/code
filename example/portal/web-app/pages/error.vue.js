var portalError = Vue.component("Error", {
    template: `<div>

  <v-layout align-center column justify-center>
    <img src="/img/error.png" height="80px" />
    <h1 class="display-2 font-weight-thin mb-3">Oh snap.</h1>
    <h4 class="subheading">An error occurred and now we're here.</h4>
    <v-card-text v-if="err !== undefined">
      <v-text-field v-if="err.code" box label="Error code" :value="err.code"></v-text-field>
      <v-textarea v-if="err.detail !== undefined" box label="Detail" :value="err.detail"></v-textarea>
      <v-textarea v-else box label="Error" :value="err"></v-textarea>
    </v-card-text>
    <v-btn @click="$router.push('/')" color="primary">Try Again</v-btn>
  </v-layout>

</div>`,
    props: ['err'],
    data() {
        return {
        };
    },
    mounted() {
        console.log('error component ending session on error:', this.err)
        ofte.endSession()
    }
});