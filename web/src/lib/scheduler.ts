import { addDays, setHours, setMinutes, setSeconds } from 'date-fns'
import type { GeneratedPost } from '@/types/database'
import { randomPick } from './utils'

export const DEFAULT_GOLDEN_HOURS = [
  { hour: 7, minute: 0 },
  { hour: 11, minute: 30 },
  { hour: 16, minute: 0 },
  { hour: 20, minute: 30 },
]

export interface ScheduleEntry {
  post_id: string
  property_id: string
  target_group_url: string
  scheduled_at: string
  selected_images: string[]
  variant_index: number
  style: string
  title: string
}

export interface SchedulerConfig {
  posts: GeneratedPost[]
  groupUrls: string[]
  startDate: Date
  endDate: Date
  goldenHours?: typeof DEFAULT_GOLDEN_HOURS
  propertyImages: string[]
  propertyId: string
}

/**
 * Anti-Spam Scheduling Algorithm
 * Rules:
 * - Same group + same day: max 4 posts matching 4 golden hours
 * - Posts on same day/group MUST have different styles/content
 * - Each post: random 3 images from pool
 * - Rotation: Day1: posts 1-4, Day2: posts 5-8, Day3: repeat Day1
 */
export function buildSchedule(config: SchedulerConfig): ScheduleEntry[] {
  const {
    posts,
    groupUrls,
    startDate,
    endDate,
    goldenHours = DEFAULT_GOLDEN_HOURS,
    propertyImages,
    propertyId,
  } = config

  const entries: ScheduleEntry[] = []
  const postsPerDay = goldenHours.length // 4
  const totalPosts = posts.length // typically 10
  const poolSize = posts.length

  // Iterate days
  let dayOffset = 0
  let currentDate = new Date(startDate)

  while (currentDate <= endDate) {
    // Which posts to use this day: rotate through pool
    const dayIndex = dayOffset % Math.ceil(poolSize / postsPerDay)
    const startPostIndex = (dayIndex * postsPerDay) % poolSize

    for (const groupUrl of groupUrls) {
      for (let slotIndex = 0; slotIndex < goldenHours.length; slotIndex++) {
        const postIndex = (startPostIndex + slotIndex) % poolSize
        const post = posts[postIndex]
        const { hour, minute } = goldenHours[slotIndex]

        // Build scheduled timestamp
        let scheduledAt = new Date(currentDate)
        scheduledAt = setHours(scheduledAt, hour)
        scheduledAt = setMinutes(scheduledAt, minute)
        scheduledAt = setSeconds(scheduledAt, 0)

        // Random 3 images from pool (max 10)
        const selectedImages = randomPick(
          propertyImages.length >= 3 ? propertyImages : propertyImages,
          Math.min(3, propertyImages.length)
        )

        entries.push({
          post_id: post.id,
          property_id: propertyId,
          target_group_url: groupUrl,
          scheduled_at: scheduledAt.toISOString(),
          selected_images: selectedImages,
          variant_index: post.variant_index,
          style: post.style,
          title: post.title,
        })
      }
    }

    dayOffset++
    currentDate = addDays(currentDate, 1)
  }

  return entries
}

export function getDefaultDateRange(days = 3): { startDate: Date; endDate: Date } {
  const startDate = new Date()
  startDate.setHours(0, 0, 0, 0)
  const endDate = addDays(startDate, days - 1)
  endDate.setHours(23, 59, 59, 999)
  return { startDate, endDate }
}

export function formatGoldenHour(h: typeof DEFAULT_GOLDEN_HOURS[0]): string {
  return `${String(h.hour).padStart(2, '0')}:${String(h.minute).padStart(2, '0')}`
}

export function parseGoldenHour(timeStr: string): typeof DEFAULT_GOLDEN_HOURS[0] {
  const [hour, minute] = timeStr.split(':').map(Number)
  return { hour, minute }
}
