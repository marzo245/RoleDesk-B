import { Server } from 'socket.io'
import { JoinRealm, Disconnect, OnEventCallback, MovePlayer, Teleport, ChangedSkin, NewMessage } from './socket-types'
import { z } from 'zod'
import { supabase } from '../supabase'
import { users } from '../Users'
import { sessionManager } from '../session'
import { removeExtraSpaces } from '../utils'
import { kickPlayer } from './helpers'
import { formatEmailToName } from '../utils'

// variables globales internas
const joiningInProgress = new Set<string>()

function protectConnection(io: Server) {
    io.use(async (socket, next) => {
        const access_token = socket.handshake.headers['authorization']?.split(' ')[1]
        const uid = socket.handshake.query.uid as string
        if (!access_token || !uid) {
            return next(new Error("Invalid access token or uid."))
        }
        const { data: user, error } = await supabase.auth.getUser(access_token)
        if (error || !user || user.user.id !== uid) {
            return next(new Error("Invalid access token or uid."))
        }
        users.addUser(uid, user.user)
        next()
    })
}

export function sockets(io: Server) {
    protectConnection(io)

    io.on('connection', (socket) => {
        function on(eventName: string, schema: z.ZodTypeAny, callback: OnEventCallback) {
            socket.on(eventName, (data: any) => {
                const success = schema.safeParse(data).success
                if (!success) return
                const session = sessionManager.getPlayerSession(socket.handshake.query.uid as string)
                if (!session) return
                callback({ session, data })
            })
        }

        function emit(eventName: string, data: any) {
            const session = sessionManager.getPlayerSession(socket.handshake.query.uid as string)
            if (!session) return

            const room = session.getPlayerRoom(socket.handshake.query.uid as string)
            const players = session.getPlayersInRoom(room)

            for (const player of players) {
                if (player.socketId === socket.id) continue
                io.to(player.socketId).emit(eventName, data)
            }
        }

        function emitToSocketIds(socketIds: string[], eventName: string, data: any) {
            console.log(`Backend - Emitting ${eventName} to ${socketIds.length} sockets:`, socketIds)
            for (const socketId of socketIds) {
                console.log(`Backend - Sending ${eventName} to socket:`, socketId)
                io.to(socketId).emit(eventName, data)
            }
        }

        socket.on('joinRealm', async (realmData: z.infer<typeof JoinRealm>) => {
            const uid = socket.handshake.query.uid as string
            const rejectJoin = (reason: string) => {
                socket.emit('failedToJoinRoom', reason)
                joiningInProgress.delete(uid)
            }

            if (!JoinRealm.safeParse(realmData).success) {
                return rejectJoin('Invalid request data.')
            }

            if (joiningInProgress.has(uid)) {
                return rejectJoin('Already joining a space.')
            }

            joiningInProgress.add(uid)

            console.log('Backend - Attempting to join realm:', realmData.realmId)
            console.log('Backend - User ID:', uid)
            console.log('Backend - Share ID:', realmData.shareId)

            const { data: realm, error: realmError } = await supabase
                .from('realms')
                .select('owner_id, share_id, map_data')
                .eq('id', realmData.realmId)
                .single()

            if (realmError || !realm) {
                console.log('Backend - Realm error:', realmError)
                return rejectJoin('Space not found.')
            }

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('skin')
                .eq('id', uid)
                .single()

            if (profileError) {
                console.log('Backend - Profile error:', profileError)
                return rejectJoin('Failed to get profile.')
            }

            const join = async () => {
                if (!sessionManager.getSession(realmData.realmId)) {
                    sessionManager.createSession(realmData.realmId, realm.map_data)
                }

                const currentSession = sessionManager.getPlayerSession(uid)
                if (currentSession) {
                    kickPlayer(uid, 'You have logged in from another location.')
                }

                const user = users.getUser(uid)!
                const username = formatEmailToName(user.user_metadata.email)

                sessionManager.addPlayerToSession(
                    socket.id,
                    realmData.realmId,
                    uid,
                    username,
                    profile.skin
                )

                const player = sessionManager.getPlayerSession(uid).getPlayer(uid)
                const session = sessionManager.getPlayerSession(uid)

                socket.join(realmData.realmId)
                socket.emit('joinedRealm')
                
                console.log(`Backend - Player ${uid} joined with socket ID: ${socket.id}`)
                
                // Enviar información del nuevo jugador a todos los demás
                console.log(`Backend - Broadcasting new player ${uid} to others`)
                emit('playerJoinedRoom', player)
                
                // Enviar información de todos los jugadores existentes al nuevo jugador
                const allPlayersInRoom = session.getPlayersInRoom(player.room)
                console.log(`Backend - Sending existing players to new user ${uid}:`, allPlayersInRoom.length)
                console.log(`Backend - All players in room:`, allPlayersInRoom.map(p => ({ uid: p.uid, socketId: p.socketId })))
                for (const existingPlayer of allPlayersInRoom) {
                    if (existingPlayer.uid !== uid) {
                        console.log(`Backend - Sending existing player to ${uid}:`, { uid: existingPlayer.uid, username: existingPlayer.username, x: existingPlayer.x, y: existingPlayer.y })
                        console.log(`Backend - Socket connected: ${socket.connected}, Socket ID: ${socket.id}`)
                        socket.emit('playerJoinedRoom', existingPlayer)
                        console.log(`Backend - Sent playerJoinedRoom event for ${existingPlayer.uid}`)
                    } else {
                        console.log(`Backend - Skipping self (${uid}) when sending existing players`)
                    }
                }
                
                joiningInProgress.delete(uid)
                console.log('Backend - Join successful for user:', uid)
            }

            console.log('Backend - Checking ownership...')
            console.log('Backend - Is owner?', realm.owner_id === uid)

            if (realm.owner_id === uid) {
                console.log('Backend - User is owner, allowing join')
                return join()
            }
            
            console.log('Backend - User is not owner, checking share logic...')
            console.log('Backend - Provided shareId:', realmData.shareId)
            console.log('Backend - Realm shareId:', realm.share_id)
            
            // Si no hay shareId proporcionado o está vacío, y el realm tiene share_id, rechazar
            if ((!realmData.shareId || realmData.shareId === '') && realm.share_id) {
                console.log('Backend - REJECTED: No shareId provided but realm requires one')
                return rejectJoin('This realm requires a share link.')
            }
            
            // Si hay shareId proporcionado, debe coincidir con el del realm
            if (realmData.shareId && realmData.shareId !== '' && realm.share_id !== realmData.shareId) {
                console.log('Backend - REJECTED: ShareId mismatch')
                return rejectJoin('The share link has been changed.')
            }

            console.log('Backend - Share validation passed, allowing join')
            return join()
        })

        // Eventos de movimiento y otras acciones del jugador
        on('movePlayer', MovePlayer, ({ session, data }) => {
            const uid = socket.handshake.query.uid as string
            console.log(`Backend - ${uid} moved to:`, data.x, data.y)
            
            // Debug: verificar estado de la sesión
            const allPlayers = session.getPlayerIds()
            console.log(`Backend - Total players in session:`, allPlayers.length, allPlayers)
            const room = session.getPlayerRoom(uid)
            console.log(`Backend - Player ${uid} is in room:`, room)
            
            // Actualizar la posición del jugador y obtener los socketIds de jugadores con proximityId cambiado
            const proximityChangedSocketIds = session.movePlayer(uid, data.x, data.y)
            
            // Obtener todos los socket IDs de la sala para notificar el movimiento
            const socketIds = sessionManager.getSocketIdsInRoom(session.id, room)
            // Filtrar el socket del jugador que se movió para no enviarse el evento a sí mismo
            const otherSocketIds = socketIds.filter(socketId => socketId !== socket.id)
            
            console.log(`Backend - Notifying ${otherSocketIds.length} players about movement`)
            emitToSocketIds(otherSocketIds, 'playerMoved', { uid, x: data.x, y: data.y })
            
            // Enviar eventos de proximidad a los jugadores que cambiaron su proximityId
            if (proximityChangedSocketIds.length > 0) {
                console.log(`Backend - Sending proximity updates to ${proximityChangedSocketIds.length} players`)
                for (const socketId of proximityChangedSocketIds) {
                    const player = session.getPlayerBySocketId(socketId)
                    if (player) {
                        console.log(`Backend - Sending proximityUpdate to ${player.uid}: ${player.proximityId}`)
                        io.to(socketId).emit('proximityUpdate', { proximityId: player.proximityId })
                    }
                }
            }
        })

        on('teleport', Teleport, ({ session, data }) => {
            const uid = socket.handshake.query.uid as string
            const socketIds = session.changeRoom(uid, data.roomIndex, data.x, data.y)
            emitToSocketIds(socketIds, 'playerTeleported', { uid, x: data.x, y: data.y, roomIndex: data.roomIndex })
        })

        on('changedSkin', ChangedSkin, ({ session, data }) => {
            const uid = socket.handshake.query.uid as string
            const room = session.getPlayerRoom(uid)
            const socketIds = sessionManager.getSocketIdsInRoom(session.id, room)
            emitToSocketIds(socketIds, 'playerChangedSkin', { uid, skin: data })
        })

        on('sendMessage', NewMessage, ({ session, data }) => {
            const uid = socket.handshake.query.uid as string
            const message = removeExtraSpaces(data).substring(0, 500)
            if (message.length === 0) return
            const room = session.getPlayerRoom(uid)
            const socketIds = sessionManager.getSocketIdsInRoom(session.id, room)
            emitToSocketIds(socketIds, 'receiveMessage', { uid, message })
        })

        // Handler para expulsar usuarios desde la administración
        socket.on('kickPlayer', ({ uid }) => {
            // Aquí podrías validar que solo el owner puede expulsar si lo deseas
            kickPlayer(uid, 'Expulsado por el administrador');
        });

        // Resto de eventos: disconnect, etc...

        on('disconnect', Disconnect, ({ session }) => {
            const uid = socket.handshake.query.uid as string
            const socketIds = sessionManager.getSocketIdsInRoom(session.id, session.getPlayerRoom(uid))
            const success = sessionManager.logOutBySocketId(socket.id)
            if (success) {
                emitToSocketIds(socketIds, 'playerLeftRoom', uid)
                users.removeUser(uid)
            }
        })
    })
}
