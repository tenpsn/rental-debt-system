// เขตเวลาที่ใช้คิดวันที่ทางธุรกิจ ใช้เวลาประเทศไทยเสมอ ไม่ขึ้นกับเขตเวลาของเครื่อง server
export const BUSINESS_TIME_ZONE = 'Asia/Bangkok';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// วันที่วันนี้ตามเวลาประเทศไทย รูปแบบเดียวกับที่ฐานข้อมูลใช้
export function todayIso(now = new Date()) {
  return formatter.format(now);
}
