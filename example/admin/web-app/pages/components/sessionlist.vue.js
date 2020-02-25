Vue.component("session-list", {
    template: `<div>
  <v-data-table :headers="headers" :items="sessions" :pagination.sync="pagination" 
    :total-items="totalSessions" :loading="loading"
    :rows-per-page="10" class="elevation-1" must-sort>
    <template slot="items" slot-scope="props">
      <td class="text-xs-left">{{ props.item.session }}</td>
      <td class="text-xs-left">{{ props.item.keyId }}</td>
      <td class="text-xs-left">{{ props.item.aaguid }}</td>
      <td class="text-xs-left">{{ props.item.username }}</td>
      <td class="text-xs-left">{{ props.item.ts }}</td>
      <td class="text-xs-left">{{ props.item.age }}</td>
      <td class="text-xs-left">{{ props.item.country }}</td>
      <td class="text-xs-right">
        <v-icon small @click="killSession(props.item)" title="Kill this session">
          stop
        </v-icon>
      </td>
    </template>
  </v-data-table>

  <confirm-dialog ref='confirmDelete'></confirm-dialog>
</div>`,
    data() {
        return {
            timer: null,
            dateFormat: "h:mm:ss a",
            totalSessions: 0,
            sessions: [],
            loading: true,
            pagination: {
                rowsPerPage: 10,
                hitCount: 0
            },
            headers: [
                { text: 'Session ID', value: 'session', sortable: false },
                { text: 'Key ID', value: 'keyId', sortable: false },
                { text: 'AAGUID', value: 'aaguid', sortable: false },
                { text: 'User', value: 'username', sortable: false },
                { text: 'Timestamp', value: 'ts', sortable: false },
                { text: 'Age', value: 'age' },
                { text: 'Country', value: 'country', sortable: false },
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
                            rObj["ts"] = moment(obj["ts"]).format(this.dateFormat)
                            return rObj;
                        });
                        this.loading = false
                        this.sessions = reformattedArray
                        this.totalSessions = data.data.length
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
                    rObj["ts"] = moment(obj["ts"]).format(this.dateFormat)
                    return rObj;
                });
                this.loading = false
                this.sessions = reformattedArray
                this.totalSessions = data.data.length
            })

        let pagination = this.pagination
        this.timer = setInterval(function () {
            pagination.hitCount++
        }, 3000)
    },
    destroyed() {
        clearInterval(this.timer)
    },
    methods: {

        getDataFromApi() {
            //this.loading = true
            const { sortBy, descending, page, rowsPerPage } = this.pagination

            if (this.pagination.sortBy == null) {
                debugger
            }
            let url = this.adminAPIEndpoint + "/admin/v1/sessions"

            return axios.get(url)
        },

        killSession(item) {
            this.$refs.confirmDelete.open('Delete key', 'Are you sure? This will end the users\'s session.', { color: 'red' }).then((confirm) => {
                if (confirm) {
                    let url = this.adminAPIEndpoint + "/admin/v1/sessions/" + item.session
                    axios.delete(url)
                        .then(() => {
                            console.log('session killed')
                            this.reload()
                        })
                        .catch(err => { console.log('error killing session', err) })
                }
            })
        },

        reload() {
            this.pagination.hitCount++
        }
    }
})