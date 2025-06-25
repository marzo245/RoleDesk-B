import { z } from 'zod'

export const GetPlayersInRoom = z.object({
    roomIndex: z.string().transform((val) => parseInt(val, 10)),
})

export const IsOwnerOfServer = z.object({
    serverId: z.string(),
})

export const GetServerName = z.object({
    serverId: z.string(),
})

export const GetChannelName = z.object({
    serverId: z.string(),
    channelId: z.string(),
    userId: z.string(),
})

export const UserIsInGuild = z.object({
    guildId: z.string(),
})

export const GetPlayerCounts = z.object({
    realmIds: z.string().transform((s) => s.split(',')),
})