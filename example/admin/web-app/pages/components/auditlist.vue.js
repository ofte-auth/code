Vue.component("audit-list", {
    template: `<div>
  <v-data-table :headers="headers" :items="entries" :pagination.sync="pagination" 
    :total-items="totalEntries" :loading="loading"
    :rows-per-page="10" class="elevation-1" must-sort>
    <template slot="items" slot-scope="props">
      <td class="text-xs-left">{{ props.item.createdAt }}</td>
      <td class="text-xs-left">{{ props.item.action }}</td>
      <td class="text-xs-left">{{ props.item.principalUsername }}</td>
      <td class="text-xs-left">{{ props.item.fidoKeyId }}</td>
      <td class="text-xs-left">{{ props.item.city }}</td>
      <td class="text-xs-left">{{ props.item.region }}</td>
      <td class="text-xs-left">{{ props.item.country }}</td>
    </template>
  </v-data-table>

  <confirm-dialog ref='confirmDelete'></confirm-dialog>
</div>`,
    data() {
        return {
            timer: null,
            dateFormat: "h:mm:ss a",
            totalEntries: 0,
            entries: [],
            loading: true,
            pagination: {
                page: 1,
                rowsPerPage: 10,
                descending: true,
                hitCount: 0
            },
            headers: [
                { text: 'Time', value: 'created_at'},
                { text: 'Action', value: 'action'},
                { text: 'Username', value: 'principalUsername'},
                { text: 'Key ID', value: 'fidoKeyId' },
                { text: 'City', value: 'city'},
                { text: 'Region', value: 'region'},
                { text: 'Country', value: 'country'}
            ]
        }
    },
    watch: {
        pagination: {
            handler() {
                this.getDataFromApi()
                    .then(data => {this.displayData(data)})
            },
            deep: true
        }
    },
    mounted() {
        this.getDataFromApi()
        .then(data => {this.displayData(data)})

        let pagination = this.pagination
        this.timer = setInterval(function() {
            pagination.hitCount++
        }, 3000)
    },
    destroyed() {
        clearInterval(this.timer)
    },
    methods: {
        encodeQueryData(data) {
            const ret = [];
            for (let d in data)
                ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
            return ret.join('&');
        },

        getDataFromApi() {
            //this.loading = true
            const { sortBy, descending, page, rowsPerPage } = this.pagination

            let url = this.adminAPIEndpoint + "/admin/v1/logs?"
            const queryParams = { 'group': 'auth', 'orderBy': sortBy, 'orderDirection': descending ? 'DESC' : 'ASC', 'page': page, 'limit': rowsPerPage };
            url += this.encodeQueryData(queryParams)

            return axios.get(url)
        },

        displayData(data) {
            let total = parseInt(data.headers["results-total"])
            let now = moment()
            var reformattedArray = data.data.map(obj => {
                var rObj = obj
                let then = moment(obj["createdAt"])
                let display = then.fromNow()
                if (now.diff(then, "days") < 1) {
                    display += " at " + then.format("h:mm:ss a")
                } else {
                    display += " on " + then.format("MMM DD")
                }
                rObj["createdAt"] = display

                rObj["fidoKeyId"] = obj["fidoKeyId"].substring(0, 8) + '...'
                return rObj;
            });
            this.loading = false
            this.entries = reformattedArray
            this.totalEntries = total
        },

        reload() {
            this.pagination.hitCount++
        }
    }
})