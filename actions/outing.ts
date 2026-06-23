'use server'

import { db } from '@/lib/db/client'
import {
  outings, outingParticipants, groupEpochs, profiles,
} from '@/lib/db/schema'
import { and, eq, isNull, inArray } from 'drizzle-orm'
import { requireViewerGroup } from '@/lib/auth/viewer'
import { generateShareToken, generateClaimToken } from '@/lib/outing/token'
import { revalidatePath } from 'next/cache'

type CurrencyCode = 'twd' | 'cny' | 'usd' | 'jpy'

export interface CreateOutingInput {
  name: string
  currency?: CurrencyCode
}

export async function createOuting(input: CreateOutingInput) {
  const { user, group } = await requireViewerGroup()

  const name = input.name.trim()
  if (!name) throw new Error('出遊名稱為空')
  if (name.length > 100) throw new Error('出遊名稱過長')
  const currency = (input.currency ?? group.baseCurrency) as CurrencyCode

  const [currentEpoch] = await db
    .select()
    .from(groupEpochs)
    .where(and(eq(groupEpochs.groupId, group.id), isNull(groupEpochs.endedAt)))
    .limit(1)
  if (!currentEpoch) throw new Error('找不到當前章節')

  const memberIds = [group.memberA, group.memberB].filter(Boolean) as string[]
  const memberProfiles = await db
    .select({ id: profiles.id, displayName: profiles.displayName })
    .from(profiles)
    .where(inArray(profiles.id, memberIds))

  const created = await db.transaction(async (tx) => {
    const [outing] = await tx
      .insert(outings)
      .values({
        groupId: group.id,
        epochId: currentEpoch.id,
        createdBy: user.id,
        name,
        currency,
        shareToken: generateShareToken(),
        status: 'active',
      })
      .returning()

    if (memberProfiles.length > 0) {
      await tx.insert(outingParticipants).values(
        memberProfiles.map((m) => ({
          outingId: outing.id,
          displayName: m.displayName,
          profileId: m.id,
          claimToken: generateClaimToken(),
          claimedAt: new Date(),
        })),
      )
    }
    return outing
  })

  revalidatePath('/outings')
  return created
}
