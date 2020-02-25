Vue.component("user-list", {
    template: `<div>
    <v-data-table :headers="headers" :items="keys" :pagination.sync="pagination" 
    :total-items="totalUsers" :loading="loading"
    :rows-per-page="25" class="elevation-1" must-sort>
    <template slot="items" slot-scope="props">
      <td class="text-xs-left">{{ props.item.username }}</td>
      <td class="text-xs-left">{{ props.item.state }}</td>
      <td class="text-xs-left">{{ props.item.displayName }}</td>
      <td class="text-xs-left">{{ props.item.createdAt }}</td>
      <td class="text-xs-right">
        <v-icon small class="mr-2" @click="editItem(props.item)" title="View the audit log for this user">
          history
        </v-icon>
        <v-icon v-if="props.item.state=='active'" small class="mr-2" @click="disable(props.item)" title="Disable this user">
          block
        </v-icon>
        <v-icon v-else small class="mr-2" @click="enable(props.item)" title="Enable this user">
          add_circle
        </v-icon>
      </td>
    </template>
  </v-data-table>

  <confirm-dialog ref='confirmDelete'></confirm-dialog>
</div>`,
    data() {
        return {
            dateFormat: "MMM DD, YYYY h:mm:ss a",
            tzName: new Date().toLocaleString('en', {timeZoneName:'short'}).split(' ').pop(),
            totalUsers: 0,
            keys: [],
            loading: true,
            pagination: {
                rowsPerPage: 10,
                hitCount: 0
            },
            headers: [
                { text: 'Username', value: 'username' },
                { text: 'State', value: 'state'},
                { text: 'Display Name', value: 'display_name'},
                { text: 'Creation Time', value: 'created_at' },
            ]
        }
    },
    watch: {
        pagination: {
            handler() {
                this.getDataFromApi()
                    .then(data => {
                        var reformattedArray = data.data.map(obj => {
                            var rObj = obj
                            rObj["createdAt"] = moment(obj["createdAt"]).format(this.dateFormat) + " " + this.tzName
                            return rObj;
                        });
                        this.loading = false
                        this.keys = reformattedArray
                        this.totalUsers = parseInt(data.headers["results-total"])
                    })
            },
            deep: true
        }
    },
    mounted() {
        this.getDataFromApi()
        .then(data => {
            var reformattedArray = data.data.map(obj => {
                var rObj = obj
                rObj["createdAt"] = moment(obj["createdAt"]).format(this.dateFormat)  + " " + this.tzName
                return rObj;
            });
            this.loading = false
            this.keys = reformattedArray
            this.totalUsers = parseInt(data.headers["results-total"])
        })
    },
    methods: {
        encodeQueryData(data) {
            const ret = [];
            for (let d in data)
                ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
            return ret.join('&');
        },

        getDataFromApi() {
            this.loading = true
            const { sortBy, descending, page, rowsPerPage } = this.pagination
            let url = this.adminAPIEndpoint + "/admin/v1/principals?"
            const queryParams = { 'orderBy': sortBy, 'orderDirection': descending ? "DESC" : "ASC", 'page': page, 'limit': rowsPerPage };
            url += this.encodeQueryData(queryParams)

            return axios.get(url)
        },

        disable(item) {
            this.$refs.confirmDelete.open('Disable user', 'Are you sure? Any active session will be closed and the user will not be able to authenticate.', { color: 'red' }).then((confirm) => {
                if (confirm) {
                    let url = this.adminAPIEndpoint + "/admin/v1/principals/" + item.username
                    axios.put(url, {"state": "revoked"})
                        .then(() => {
                            console.log('user disabled')
                            this.reload()
                        })
                        .catch(err => {console.log('error disabling user', err)})    
                }
            })            
        },

        enable(item) {
            this.$refs.confirmDelete.open('Enable user', 'Are you sure?', { color: 'red' }).then((confirm) => {
                if (confirm) {
                    let url = this.adminAPIEndpoint + "/admin/v1/principals/" + item.username
                    axios.put(url, {"state": "active"})
                        .then(() => {
                            console.log('user enabled')
                            this.reload()
                        })
                        .catch(err => {console.log('error disabling user', err)})    
                }
            })            
        },

        reload() {
            this.pagination.hitCount++
        }
    }
})