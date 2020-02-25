var adminUsers = Vue.component("Users", {
    template: `
        <user-list></user-list>
    `,
    mounted() {
        this.$root.msg = "User Management"
    },
    methods: {
    }
});