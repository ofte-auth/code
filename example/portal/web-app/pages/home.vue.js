var portalHome = Vue.component("Home", {
    template: `<div>
    <v-layout>
    <v-flex xs12 sm6 offset-sm3>
    <h2>Quotes of the Day</h2>
    <span>Each request for a new quote is authenticated by the OfteKey<br><br></span>
      <v-card>
        <v-img
          src="/img/desert.jpg"
          aspect-ratio="2.75">
        </v-img>

        <v-card-title primary-title>
          <div>
            <h3 class="headline mb-0">{{quote}}</h3>
            <br/>
            <h4>-{{author}}</h4>
          </div>
        </v-card-title>

        <v-card-actions>
          <v-btn flat color="orange" v-on:click="loadQuote">New Quote</v-btn>
        </v-card-actions>
      </v-card>
    </v-flex>
  </v-layout>
  </div>`,
    data() {
        return {
            quote: '',
            author: '',
            copyright: ''
        };
    },
    created() {
    },
    mounted() {
        this.loadQuote()
    },
    methods: {
        loadQuote() {
            ofte.getJSONResponseAuthorized("GET", "/quote", null)
                .then((res) => {
                    data = JSON.parse(res.responseText)
                    this.quote = data.Quote
                    this.author = data.Person
                })
                .catch((err) => {
                    console.log('error getting quote:', err)
                    _this.$root.$data.googleIDToken = ''
                    router.push({name: 'error', params: {err: err}})
                })
        }
    }
});