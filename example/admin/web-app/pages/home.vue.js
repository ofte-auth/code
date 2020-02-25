var adminHome = Vue.component("Home", {
    template: `<div>
  <session-map></session-map>
  <v-container grid-list-md fluid fill style="padding:0px">
    <v-layout row wrap align-start justify-start row fill-height>
      <v-flex lg12 md12>
        <v-card>
        <v-toolbar card color="blue-grey" dark>
          <v-toolbar-title>Active Sessions</v-toolbar-title>
        </v-toolbar>
        <v-card-text>
          <session-list></session-list>
        </v-card-text>
      </v-card>
      </v-flex>
      <v-flex lg12 md12>
        <v-card>
        <v-toolbar card color="blue-grey" dark>
          <v-toolbar-title>Auditing</v-toolbar-title>
        </v-toolbar>
        <v-card-text>
          <audit-list></audit-list>
        </v-card-text>
      </v-card>
      </v-flex>
    </v-layout>
  </v-container>

</div>`,
    props: ["title"],
    data() {
        return {
            showProgress: false
        };
    },
    created() {
    },
    mounted() {
        this.$root.msg = "Dashboard"
    },
    methods: {
    }
}
);