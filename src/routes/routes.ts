import { Router } from 'express'
import { GetPlayersInRoom, GetServerName, IsOwnerOfServer, UserIsInGuild, GetChannelName, GetPlayerCounts } from './route-types'
import { supabase } from '../supabase'
import { z } from 'zod'
import { sessionManager } from '../session'

export default function routes(): Router {
    const router = Router()

    router.get('/getPlayersInRoom', async (req, res) => {
        const access_token = req.headers.authorization?.split(' ')[1];

        if (!access_token) {
            return res.status(401).json({ message: 'No access token provided' });
        }

        const params = req.query as unknown as z.infer<typeof GetPlayersInRoom>
        if (!GetPlayersInRoom.safeParse(params).success) {
            return res.status(400).json({ message: 'Invalid parameters' })
        }

        const { data: user, error: error } = await supabase.auth.getUser(access_token)

        if (error) {
            return res.status(401).json({ message: 'Invalid access token' })
        }

        const session = sessionManager.getPlayerSession(user.user.id)
        if (!session) {
            return res.status(400).json({ message: 'User not in a realm.' })
        }

        const players = session.getPlayersInRoom(params.roomIndex)
        return res.json({ players })
    })

    router.get('/getPlayerCounts', async (req, res) => {
        const access_token = req.headers.authorization?.split(' ')[1];

        if (!access_token) {
            return res.status(401).json({ message: 'No access token provided' });
        }

        let params = req.query as unknown as z.infer<typeof GetPlayerCounts>
        const parseResults = GetPlayerCounts.safeParse(params)
        if (!parseResults.success) {
            return res.status(400).json({ message: 'Invalid parameters' })
        }

        params = parseResults.data

        if (params.realmIds.length > 100) {
            return res.status(400).json({ message: 'Too many server IDs' })
        }

        const { data: user, error: error } = await supabase.auth.getUser(access_token)

        if (error) {
            return res.status(401).json({ message: 'Invalid access token' })
        }

        const playerCounts: number[] = []
        for (const realmId of params.realmIds) {
            const session = sessionManager.getSession(realmId)
            if (session) {
                const playerCount = session.getPlayerCount()

                playerCounts.push(playerCount)
            } else {
                playerCounts.push(0)
            }
        }

        return res.json({ playerCounts })
    })

    return router
}