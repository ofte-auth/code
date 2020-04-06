var adminAAGUIDs = Vue.component("AAGUIDS", {
    template: `
        <aaguid-list></aaguid-list>
    `,
    mounted() {
        this.$root.msg = "AAGUID Management"
    },
    methods: {
    }
});