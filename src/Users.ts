import { User } from '@supabase/supabase-js'

class Users {
    private users: { [key: string]: User } = {}

    addUser(id: string, user: User) {
        this.users[id] = user
    }

    getUser(id: string): User | undefined {
        return this.users[id]
    }

    removeUser(id: string) {
        delete this.users[id]
    }
}

const users = new Users()

export { users }

