Vue.component("aaguid-list", {
    template: `<div>
    <v-data-table :headers="headers" :items="aaguids" :pagination.sync="pagination" 
    :total-items="totalItems" :loading="loading"
    :rows-per-page="25" class="elevation-1" must-sort>
    <template slot="items" slot-scope="props">
      <td class="text-xs-left">{{ props.item.id }}</td>
      <td class="text-xs-left">{{ props.item.label }}</td>
      <td class="text-xs-left">{{ props.item.state }}</td>
      <td class="text-xs-right">
        <v-icon v-if="props.item.state=='active'" small class="mr-2" @click="disable(props.item)" title="Revoke this aaguid">
          block
        </v-icon>
        <v-icon v-else small class="mr-2" @click="enable(props.item)" title="Activate this aaguid">
          add_circle
        </v-icon>
      </td>
    </template>
  </v-data-table>

  <confirm-dialog ref='confirmDelete'></confirm-dialog>
</div>`,
    data() {
        return {
            totalItems: 0,
            aaguids: [],
            loading: true,
            pagination: {
                rowsPerPage: 10,
                hitCount: 0
            },
            headers: [
                { text: 'AAGUID', value: 'id'},
                { text: 'Label', value: 'label'},
                { text: 'State', value: 'state'},
                { text: 'Actions', value: 'name', sortable: false, align: 'right' }
            ]
        }
    },
    watch: {
        pagination: {
            handler() {
                this.getDataFromApi()
                    .then(data => {
                        this.loading = false
                        this.aaguids = data.data
                        this.totalItems = parseInt(data.headers["results-total"])
                    })
            },
            deep: true
        }
    },
    mounted() {
        this.getDataFromApi()
        .then(data => {
            this.loading = false
            this.aaguids = data.data
            this.totalItems = parseInt(data.headers["results-total"])
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
            let url = this.adminAPIEndpoint + "/admin/v1/aaguids?"
            const queryParams = { 'orderBy': sortBy, 'orderDirection': descending ? "DESC" : "ASC", 'page': page, 'limit': rowsPerPage };
            url += this.encodeQueryData(queryParams)

            return axios.get(url)
        },

        disable(item) {
            this.$refs.confirmDelete.open('Disable AAGUID', 'Are you sure? Revoking this AAGUID will disable all associated keys.', { color: 'red' }).then((confirm) => {
                if (confirm) {
                    let url = this.adminAPIEndpoint + "/admin/v1/aaguids/" + item.id
                    axios.put(url, {"state": "revoked"})
                        .then(() => {
                            console.log('aaguid revoked')
                            this.reload()
                        })
                        .catch(err => {console.log('error disabling aaguid', err)})    
                }
            })            
        },

        enable(item) {
            this.$refs.confirmDelete.open('Enable AAGUID', 'Are you sure? This action adds the AGGUID to a whitelist—only keys with matching AAGUIDs will be valid.', { color: 'red' }).then((confirm) => {
                if (confirm) {
                    let url = this.adminAPIEndpoint + "/admin/v1/aaguids/" + item.id
                    axios.put(url, {"state": "active"})
                        .then(() => {
                            console.log('aaguid activated')
                            this.reload()
                        })
                        .catch(err => {console.log('error disabling aaguid', err)})    
                }
            })            
        },

        reload() {
            this.pagination.hitCount++
        }
    }
})