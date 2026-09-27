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

export interface GenerateScheduleSlotsOptions {
  numPosts: number
  numDays: number
  startPreference?: 'auto' | 'tomorrow' | 'today'
  goldenHours?: typeof DEFAULT_GOLDEN_HOURS
  now?: Date
}

/**
 * Thuật toán lên lịch thông minh:
 * 1. TUYỆT ĐỐI KHÔNG lên lịch vào giờ quá khứ (tất cả khung giờ đều sau thời điểm tạo).
 * 2. Phân bổ đều và trọn vẹn số bài (numPosts) vào đúng số ngày (numDays) người dùng chọn.
 * 3. Tự động nhận diện các khung giờ còn lại trong ngày hôm nay, hoặc bắt đầu từ sáng mai nếu ngày hôm nay đã hết giờ.
 */
export function generateScheduleSlots(options: GenerateScheduleSlotsOptions): Date[] {
  const {
    numPosts,
    numDays,
    startPreference = 'auto',
    goldenHours = DEFAULT_GOLDEN_HOURS,
    now = new Date(),
  } = options

  if (numPosts <= 0 || numDays <= 0) return []

  // Sắp xếp các khung giờ vàng theo thứ tự thời gian trong ngày
  const sortedGH = [...goldenHours].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  const minFutureTime = now.getTime() + 15 * 60 * 1000 // Tối thiểu 15 phút tới

  // Lọc các khung giờ của HÔM NAY chưa qua (thực sự ở tương lai)
  const todayAvailableGH = sortedGH.filter((gh) => {
    const d = new Date(now)
    d.setHours(gh.hour, gh.minute, 0, 0)
    return d.getTime() > minFutureTime
  })

  // Quyết định ngày bắt đầu:
  let useToday = false
  if (startPreference === 'today') {
    useToday = todayAvailableGH.length > 0
  } else if (startPreference === 'tomorrow') {
    useToday = false
  } else {
    // 'auto'
    if (todayAvailableGH.length >= 2) {
      useToday = true
    } else if (todayAvailableGH.length === 1) {
      const capacityStartingToday = 1 + (numDays - 1) * sortedGH.length
      useToday = capacityStartingToday >= numPosts
    } else {
      useToday = false
    }
  }

  // Xây dựng danh sách các ngày hợp lệ
  let startDate = new Date(now)
  if (!useToday) {
    startDate = addDays(startDate, 1)
  }
  startDate.setHours(0, 0, 0, 0)

  const targetDaysCount = Math.max(numDays, Math.ceil(numPosts / sortedGH.length))
  const days: Array<{ date: Date; availableGH: typeof DEFAULT_GOLDEN_HOURS }> = []

  let curDate = new Date(startDate)
  for (let d = 0; d < targetDaysCount + 5; d++) {
    const isFirstDay = d === 0 && useToday
    const ghList = isFirstDay ? todayAvailableGH : sortedGH
    if (ghList.length > 0) {
      days.push({
        date: new Date(curDate),
        availableGH: ghList,
      })
    }
    curDate = addDays(curDate, 1)
  }

  // Số bài gán cho từng ngày
  const postsPerDay = new Array(days.length).fill(0)
  let remainingPosts = numPosts

  // Phân bổ đều các bài vào các ngày
  const activeDaysCount = Math.min(days.length, targetDaysCount)
  while (remainingPosts > 0) {
    let assigned = false
    for (let d = 0; d < activeDaysCount; d++) {
      if (remainingPosts <= 0) break
      if (postsPerDay[d] < days[d].availableGH.length) {
        postsPerDay[d]++
        remainingPosts--
        assigned = true
      }
    }
    if (!assigned) {
      for (let d = activeDaysCount; d < days.length; d++) {
        if (remainingPosts <= 0) break
        if (postsPerDay[d] < days[d].availableGH.length) {
          postsPerDay[d]++
          remainingPosts--
          assigned = true
        }
      }
    }
    if (!assigned) break
  }

  // Tạo timestamp chính xác cho từng bài viết
  const slots: Date[] = []
  for (let d = 0; d < days.length; d++) {
    const count = postsPerDay[d]
    if (count <= 0) continue

    const av = days[d].availableGH
    let selectedHours: typeof DEFAULT_GOLDEN_HOURS = []

    if (count >= av.length) {
      selectedHours = av
    } else if (count === 1) {
      const mid = Math.floor(av.length / 2)
      selectedHours = [av[mid]]
    } else if (count === 2) {
      selectedHours = [av[0], av[av.length - 1]]
    } else if (count === 3 && av.length === 4) {
      selectedHours = [av[0], av[1], av[3]]
    } else {
      selectedHours = av.slice(0, count)
    }

    for (const gh of selectedHours) {
      const slotDate = new Date(days[d].date)
      slotDate.setHours(gh.hour, gh.minute, 0, 0)
      if (slotDate.getTime() > now.getTime()) {
        slots.push(slotDate)
      }
    }
  }

  slots.sort((a, b) => a.getTime() - b.getTime())
  return slots.slice(0, numPosts)
}

