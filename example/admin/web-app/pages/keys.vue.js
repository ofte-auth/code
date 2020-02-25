var adminKeys = Vue.component("Keys", {
    template: `
        <key-list></key-list>
    `,
    mounted() {
        this.$root.msg = "Key Management"
    },
    methods: {
    }
});