Vue.component("key-list", {
    template: `<div>
    <v-data-table :headers="headers" :items="keys" :pagination.sync="pagination" 
    :total-items="totalKeys" :loading="loading"
    :rows-per-page="25" class="elevation-1" must-sort>
    <template slot="items" slot-scope="props">
      <td class="text-xs-left">{{ props.item.id }}</td>
      <td class="text-xs-left">{{ props.item.state }}</td>
      <td class="text-xs-left">{{ props.item.username }}</td>
      <td class="text-xs-left">{{ props.item.aaguid }}</td>
      <td class="text-xs-left">{{ props.item.certCommonName }}</td>
      <td class="text-xs-left">{{ props.item.lastUsed }}</td>
      <td class="text-xs-left">{{ props.item.createdAt }}</td>
      <td class="text-xs-right">
        <v-icon small class="mr-2" @click="editItem(props.item)" title="View the audit log for this key">
          history
        </v-icon>
        <v-icon v-if="props.item.state=='active'" small class="mr-2" @click="disable(props.item)" title="Disable this key">
          block
        </v-icon>
        <v-icon v-else small class="mr-2" @click="enable(props.item)" title="Enable this key">
          add_circle
        </v-icon>
        <v-icon small @click="deleteItem(props.item)" title="Remove this key from the system">
          delete
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
            totalKeys: 0,
            keys: [],
            loading: true,
            pagination: {
                rowsPerPage: 10,
                hitCount: 0
            },
            headers: [
                { text: 'Key ID', value: 'id' },
                { text: 'State', value: 'state'},
                { text: 'Username', value: 'username'},
                { text: 'AAGUID', value: 'aaguid'},
                { text: 'Authenticator', value: 'cert_label'},
                { text: 'Last Session', value: 'last_used'},
                { text: 'Creation Time', value: 'created_at' },
                { text: 'Actions', value: 'name', sortable: false, align: 'right' }
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
                            rObj["lastUsed"] = obj["lastUsed"] == null ? "-" : moment(obj["lastUsed"]).format(this.dateFormat) + " " + this.tzName
                            rObj["id"] = obj["id"].substring(0, 8) + '...'
                            rObj["certCommonName"] = obj["certOrganization"] + " " + obj["certCommonName"]
                            return rObj;
                        });
                        this.loading = false
                        this.keys = reformattedArray
                        this.totalKeys = parseInt(data.headers["results-total"])
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
                rObj["createdAt"] = moment(obj["createdAt"]).format(this.dateFormat) + " " + this.tzName
                rObj["lastUsed"] = obj["lastUsed"] == null ? "-" : moment(obj["lastUsed"]).format(this.dateFormat) + " " + this.tzName
                rObj["id"] = obj["id"].substring(0, 8) + '...'
                rObj["certCommonName"] = obj["certOrganization"] + " " + obj["certCommonName"]
                return rObj;
            });
            this.loading = false
            this.keys = reformattedArray
            this.totalKeys = parseInt(data.headers["results-total"])
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
            let url = this.adminAPIEndpoint + "/admin/v1/keys?"
            const queryParams = { 'orderBy': sortBy, 'orderDirection': descending ? "DESC" : "ASC", 'page': page, 'limit': rowsPerPage };
            url += this.encodeQueryData(queryParams)

            return axios.get(url)
        },

        deleteItem(item) {
            this.$refs.confirmDelete.open('Delete key', 'Are you sure? This will disable the continuous authentication feature if this is an Ofte Key.', { color: 'red' }).then((confirm) => {
                if (confirm) {
                    let url = this.adminAPIEndpoint + "/admin/v1/keys/" + item.id
                    axios.delete(url)
                        .then(() => {
                            console.log('key deleted')
                            this.reload()
                        })
                        .catch(err => {console.log('error deleting key/principal', err)})    
                }
            })
        },

        disable(item) {
            this.$refs.confirmDelete.open('Disable key', 'Are you sure? Any active session will be closed and the user will not be able to authenticate.', { color: 'red' }).then((confirm) => {
                if (confirm) {
                    let url = this.adminAPIEndpoint + "/admin/v1/keys/" + item.id
                    axios.put(url, {"state": "revoked"})
                        .then(() => {
                            console.log('key disabled')
                            this.reload()
                        })
                        .catch(err => {console.log('error disabling key', err)})    
                }
            })            
        },

        enable(item) {
            this.$refs.confirmDelete.open('Enable key', 'Are you sure?', { color: 'red' }).then((confirm) => {
                if (confirm) {
                    let url = this.adminAPIEndpoint + "/admin/v1/keys/" + item.id
                    axios.put(url, {"state": "active"})
                        .then(() => {
                            console.log('key enabled')
                            this.reload()
                        })
                        .catch(err => {console.log('error disabling key', err)})    
                }
            })            
        },

        reload() {
            this.pagination.hitCount++
        }
    }
})