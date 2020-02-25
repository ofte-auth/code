Vue.component("session-map", {
    template: `<div>
  <google-map ref="map" :center="{lat: 39.5, lng: -98.35}" :zoom="4" style="width: 100%; height: 500px">
    <google-marker v-for="(marker, index) in markers" :key="index" :position="marker.latLng" />
  </google-map>
</div>`,
    data() {
        return {
            timer: null,
            totalSessions: 0,
            sessions: [],
            loading: true,
            markers: [],
            place: null
        }
    },
    watch: {
        markers(markers) {
            if (markers.length > 1) {
                const bounds = new google.maps.LatLngBounds()
                for (let m of markers) {
                    bounds.extend(m.latLng)
                }
                this.$refs.map.fitBounds(bounds)
            }
        }
    },
    mounted() {

        this.$gmapApiPromiseLazy().then(() => {
            this.loadSessions()

            let _this = this
            _this.timer = setInterval(function() {
                _this.loadSessions()
            }, 3000)

        })
    },
    destroyed() {
        clearInterval(this.timer)
    },
    methods: {

        getDataFromApi() {
            this.loading = true
            let url = this.adminAPIEndpoint + "/admin/v1/sessions"
            return axios.get(url)
        },

        loadSessions() {
            this.getDataFromApi()
            .then(data => {
                this.loading = false
                this.sessions = data.data
                this.totalSessions = data.data.length
                let markerArray = []
                for (var i = 0; i < data.data.length; i++) {
                    markerArray.push({ latLng: { lat: data.data[i].latitude, lng: data.data[i].longitude } })
                }
                this.markers = markerArray
            })
        }
    }
})