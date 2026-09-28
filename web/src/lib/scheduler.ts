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
  specificDates?: (Date | string)[]
}

/**
 * Thuật toán lên lịch thông minh:
 * 1. TUYỆT ĐỐI KHÔNG lên lịch vào giờ quá khứ (tất cả khung giờ đều sau thời điểm tạo).
 * 2. Nếu người dùng chọn các ngày cụ thể: Phân bổ đều số bài vào các ngày được chọn theo khung giờ vàng.
 * 3. Nếu không chọn ngày cụ thể: Phân bổ đều và trọn vẹn số bài (numPosts) vào đúng số ngày (numDays) người dùng chọn.
 * 4. Tự động nhận diện các khung giờ còn lại trong ngày hôm nay, hoặc bắt đầu từ sáng mai nếu ngày hôm nay đã hết giờ.
 */
export function generateScheduleSlots(options: GenerateScheduleSlotsOptions): Date[] {
  const {
    numPosts,
    numDays,
    startPreference = 'auto',
    goldenHours = DEFAULT_GOLDEN_HOURS,
    now = new Date(),
    specificDates,
  } = options

  if (numPosts <= 0) return []

  // Sắp xếp các khung giờ vàng theo thứ tự thời gian trong ngày
  const sortedGH = [...goldenHours].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  const minFutureTime = now.getTime() + 15 * 60 * 1000 // Tối thiểu 15 phút tới

  // TRƯỜNG HỢP 1: Người dùng lựa chọn các ngày đăng cụ thể
  if (specificDates && specificDates.length > 0) {
    const parsedDates: Date[] = []
    for (const d of specificDates) {
      let dateObj: Date
      if (typeof d === 'string') {
        const [y, m, day] = d.split('-').map(Number)
        dateObj = new Date(y, m - 1, day, 0, 0, 0, 0)
      } else {
        dateObj = new Date(d)
        dateObj.setHours(0, 0, 0, 0)
      }
      if (!isNaN(dateObj.getTime())) {
        parsedDates.push(dateObj)
      }
    }

    // Loại trùng & sắp xếp tăng dần theo thời gian
    const uniqueTimeMap = new Map<number, Date>()
    for (const d of parsedDates) {
      uniqueTimeMap.set(d.getTime(), d)
    }
    const sortedDates = Array.from(uniqueTimeMap.values()).sort((a, b) => a.getTime() - b.getTime())

    const validDays: Array<{ date: Date; availableGH: typeof DEFAULT_GOLDEN_HOURS }> = []
    const todayZero = new Date(now)
    todayZero.setHours(0, 0, 0, 0)

    for (const d of sortedDates) {
      const isToday = d.getTime() === todayZero.getTime()
      const isPast = d.getTime() < todayZero.getTime()
      if (isPast) continue

      let availableGH = sortedGH
      if (isToday) {
        availableGH = sortedGH.filter((gh) => {
          const slot = new Date(now)
          slot.setHours(gh.hour, gh.minute, 0, 0)
          return slot.getTime() > minFutureTime
        })
      }

      if (availableGH.length > 0) {
        validDays.push({ date: d, availableGH })
      }
    }

    if (validDays.length > 0) {
      const postsPerDay = new Array(validDays.length).fill(0)
      let remainingPosts = numPosts

      // Phân bổ đều các bài vào các ngày đã chọn
      while (remainingPosts > 0) {
        let assigned = false
        for (let i = 0; i < validDays.length; i++) {
          if (remainingPosts <= 0) break
          if (postsPerDay[i] < validDays[i].availableGH.length) {
            postsPerDay[i]++
            remainingPosts--
            assigned = true
          }
        }
        if (!assigned) {
          // Nếu số bài vượt quá tổng số slot giờ vàng cơ bản, tiếp tục phân bổ thêm vòng
          for (let i = 0; i < validDays.length; i++) {
            if (remainingPosts <= 0) break
            postsPerDay[i]++
            remainingPosts--
            assigned = true
          }
        }
        if (!assigned) break
      }

      const slots: Date[] = []
      for (let i = 0; i < validDays.length; i++) {
        const count = postsPerDay[i]
        if (count <= 0) continue

        const av = validDays[i].availableGH
        let selectedHours: typeof DEFAULT_GOLDEN_HOURS = []

        if (count >= av.length) {
          selectedHours = [...av]
          // Thêm các khung giờ dôi dư nếu count > av.length (cách nhau 45 phút)
          const extraCount = count - av.length
          for (let e = 0; e < extraCount; e++) {
            const baseHour = av[e % av.length]
            const extraH = (baseHour.hour + 1) % 24
            selectedHours.push({ hour: extraH, minute: (baseHour.minute + 45) % 60 })
          }
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
          const slotDate = new Date(validDays[i].date)
          slotDate.setHours(gh.hour, gh.minute, 0, 0)
          if (slotDate.getTime() > now.getTime()) {
            slots.push(slotDate)
          }
        }
      }

      slots.sort((a, b) => a.getTime() - b.getTime())
      if (slots.length > 0) {
        return slots.slice(0, numPosts)
      }
    }
  }

  // TRƯỜNG HỢP 2 (Mặc định): Không chọn ngày cụ thể -> dùng số ngày đăng liên tiếp
  if (numDays <= 0) return []


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

