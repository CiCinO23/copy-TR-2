import { normalizeToWesternDigits } from '../utils/formatters';

/**
 * Major version set to 2 (base 2.0).
 * Each modification prompt given by the user increments APP_PROMPT_REVISION by 1 after the dot (currently 2.11).
 *
 * Recorded modification prompts:
 * 1. v2.1  - حذف خانات المفتاح السري من الصفحة الرئيسية ومن أي مكان آخر وتركها فقط في الإعدادات
 * 2. v2.2  - مراجعة شاملة لتصميم التطبيق واقتراح تحسينات الاحترافية والتناسق
 * 3. v2.3  - تنفيذ تحسينات التصميم وتغيير جميع الأرقام الهندية إلى العربية (0-9)
 * 4. v2.4  - إصلاح خلل تكرار إعلانات الانسحابات الجزئية وتنفيذها الفوري بالوقت الفعلي
 * 5. v2.5  - إضافة نظام versioning و lastProcessedActionId لكل متداول في paperEngine وجعل اختيار الدخول/الرفض اختيارياً
 * 6. v2.6  - منع جلب الصفقات المغلوقة نهائياً وإضافة التاريخ أمام الساعة في معلومات الصفقات
 * 7. v2.7  - تثبيت منع فتح وإغلاق الصفقات السابقة والمغلوقة نهائياً مع عرض التاريخ أمام الساعة في كل مكان
 * 8. v2.8  - إصلاح جلب الصفقات المفتوحة في نافذة Positions للمتداولين والحيتان (المرحلة 1)
 * 9. v2.9  - معالجة الصفقات المفتوحة المخفية (positionShow: false) وصفوف Partially Closed في Positions (المرحلة 2)
 * 10. v2.10 - حماية الصفقات المفتوحة في Positions من تقييد باينانس (90801003) واستقرار مزامنتها (المرحلة 3)
 * 11. v2.11 - ترقية الإصدار الرئيسي إلى 2.11 مع إصلاح وصول الإشعارات في وضع قفل الشاشة واستمرارية عمل التطبيق عند قفل الشاشة أو تصغيره وفتح تطبيق آخر
 */
export const APP_MAJOR_VERSION = 2;
export const APP_PROMPT_REVISION = 11;
export const APP_VERSION = `${APP_MAJOR_VERSION}.${APP_PROMPT_REVISION}`;

export interface PromptVersionEntry {
  version: string;
  promptNumber: number;
  summaryAr: string;
}

export const PROMPT_VERSION_HISTORY: PromptVersionEntry[] = [
  {
    version: '2.1',
    promptNumber: 1,
    summaryAr: 'حذف خانات المفتاح السري من الصفحة الرئيسية ومن أي مكان آخر وحصرها في الإعدادات',
  },
  {
    version: '2.2',
    promptNumber: 2,
    summaryAr: 'مراجعة شاملة لتصميم التطبيق وإعداد مقترحات الاحترافية والتناسق البصري',
  },
  {
    version: '2.3',
    promptNumber: 3,
    summaryAr: 'تنفيذ تحسينات التصميم الاحترافي وتحويل كافة الأرقام الهندية إلى العربية (0-9)',
  },
  {
    version: '2.4',
    promptNumber: 4,
    summaryAr: 'إصلاح تكرار إشعارات الانسحاب الجزئي وتفعيل تنفيذ الانسحابات لحظياً مع المتداول',
  },
  {
    version: '2.5',
    promptNumber: 5,
    summaryAr: 'إضافة نظام Versioning و lastProcessedActionId لكل متداول وجعل خيار الدخول/الرفض اختيارياً',
  },
  {
    version: '2.6',
    promptNumber: 6,
    summaryAr: 'منع جلب الصفقات السابقة المغلوقة نهائياً وإضافة التاريخ أمام الساعة في معلومات الصفقات',
  },
  {
    version: '2.7',
    promptNumber: 7,
    summaryAr: 'إنهاء حلقة فتح وإغلاق الصفقات المغلوقة نهائياً وتعميم التاريخ أمام الساعة في كل مكان',
  },
  {
    version: '2.8',
    promptNumber: 8,
    summaryAr: 'تحديث جلب الصفقات المفتوحة في نافذة Positions للمتداولين والحيتان',
  },
  {
    version: '2.9',
    promptNumber: 9,
    summaryAr: 'استخراج الصفقات المفتوحة للمتداولين عند إخفاء المراكز ومعالجة Partially Closed',
  },
  {
    version: '2.10',
    promptNumber: 10,
    summaryAr: 'حماية الصفقات المفتوحة في Positions من حدود طلبات باينانس وتثبيت المزامنة الحية',
  },
  {
    version: '2.11',
    promptNumber: 11,
    summaryAr: 'ترقية الإصدار إلى 2.11 وإصلاح وصول الإشعارات واستمرارية عمل التطبيق عند قفل الشاشة أو تصغيره للعمل على تطبيق آخر',
  },
];

export function formatAppVersion(revision: number = APP_PROMPT_REVISION): string {
  const cleanRev = Math.max(0, Math.floor(Number(revision) || 0));
  return normalizeToWesternDigits(`${APP_MAJOR_VERSION}.${cleanRev}`);
}
