function getStorage(key, fallback) {
      try {
        const item = localStorage.getItem(key);
        return item !== null ? JSON.parse(item) : fallback;
      } catch (e) {
        return fallback;
      }
    }

    function setStorage(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (error) {
        window.__twhkStorageWriteFailed = true;
        window.dispatchEvent(new Event('twhk-storage-failed'));
        return false;
      }
    }

    // Flattens any field shape — string, array, or nested object — into searchable text.
    // Day records mix all three (a plain title, an array of notes, a backups object), so the
    // corpus builder cannot assume a shape.
    function extractSearchText(val) {
      if (val === null || val === undefined) return '';
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        return String(val) + ' ';
      }
      if (Array.isArray(val)) return val.map(item => extractSearchText(item)).join(' ');
      if (typeof val === 'object') return Object.values(val).map(item => extractSearchText(item)).join(' ');
      return '';
    }

    // Where each day's sunrise and sunset happen: [morning place, evening place]. Tamsui and Jiufen are the
    // sunset stops on Days 4 and 5; Day 8 ends in Tainan; Day 11 wakes in Kaohsiung and ends in Hong Kong.
    // The flight day has none.
    const SUN_COORDS = {
      taipei: [25.048, 121.517, 'Taipei'], tamsui: [25.170, 121.441, 'Tamsui'], jiufen: [25.109, 121.845, 'Jiufen'],
      kaohsiung: [22.639, 120.302, 'Kaohsiung'], tainan: [22.997, 120.213, 'Tainan'],
      hk: [22.299, 114.172, 'Hong Kong']
    };
    const SUN_PLACES = {
      'day-02': ['taipei', 'taipei'], 'day-03': ['taipei', 'taipei'], 'day-04': ['taipei', 'tamsui'], 'day-05': ['taipei', 'jiufen'],
      'day-06': ['taipei', 'taipei'], 'day-07': ['taipei', 'kaohsiung'], 'day-08': ['kaohsiung', 'tainan'], 'day-09': ['kaohsiung', 'kaohsiung'],
      'day-10': ['kaohsiung', 'kaohsiung'], 'day-11': ['kaohsiung', 'hk'], 'day-12': ['hk', 'hk'], 'day-13': ['hk', 'hk'],
      'day-14': ['hk', 'hk'], 'day-15': ['hk', 'hk'], 'day-16': ['hk', 'hk']
    };

    // NOAA sunrise/sunset (zenith 90.833°) in minutes after local midnight. Within a minute of the Hong Kong
    // Observatory's published December 2026 times. Taiwan and Hong Kong are both UTC+8 with no daylight saving.
    function sunMinutes(year, month, day, lat, lon, rising, tzHours = 8) {
      const rad = Math.PI / 180;
      const N = Math.floor(275 * month / 9) - Math.floor((month + 9) / 12) * (1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3)) + day - 30;
      const lngHour = lon / 15;
      const t = N + ((rising ? 6 : 18) - lngHour) / 24;
      const M = 0.9856 * t - 3.289;
      const L = (M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634 + 360) % 360;
      let RA = (Math.atan(0.91764 * Math.tan(L * rad)) / rad + 360) % 360;
      RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
      const sinDec = 0.39782 * Math.sin(L * rad);
      const cosDec = Math.cos(Math.asin(sinDec));
      const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
      if (cosH > 1 || cosH < -1) return NaN;
      const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
      const UT = (((H + RA - 0.06571 * t - 6.622 - lngHour) % 24) + 24) % 24;
      return Math.round(((((UT + tzHours) % 24) + 24) % 24) * 60);
    }

    const hasCjk = value => /[㐀-鿿豈-﫿]/.test(String(value || ''));

    // Intl formatters for the Now card's two clocks, keyed by time zone.
    const CLOCK_FORMATS = new Map();

    function travelOS() {
      return {
        activeTab: (() => {
          const saved = getStorage('twhk_active_tab_v10', 'today');
          const migrated = saved === 'bookings' ? 'plan' : saved;
          return ['today', 'itinerary', 'plan', 'toolkit'].includes(migrated) ? migrated : 'today';
        })(),
        planView: (() => {
          const saved = getStorage('twhk_plan_view_v20', 'bookings');
          return ['bookings', 'prep'].includes(saved) ? saved : 'bookings';
        })(),
        tabScrollPositions: { today: 0, itinerary: 0, plan: 0, toolkit: 0 },
        motionDirection: 'forward',
        appearance: 'dark',
        selectedCityFilter: 'all',
        activeDayId: 'day-02',
        lastLiveTripDayId: null,
        relevantPlan: null,
        smartLaunchActive: false,
        // The Plan list's order while the tab is open, so a card marked booked restyles in place
        // instead of jumping away under the finger (the Japan app's frozen Prep list).
        planOrder: null,
        
        takeItEasyActive: false,
        rainPlanActive: false,
        searchQuery: '',
        selectedCurrency: (() => {
          const saved = getStorage('twhk_currency_v23', 'USD');
          return ['USD', 'TWD', 'HKD'].includes(saved) ? saved : 'USD';
        })(),
        toasts: [],
        mapProvider: getStorage('twhk_map_provider_v1', 'google') === 'apple' ? 'apple' : 'google',
        bookingRefs: getStorage('twhk_booking_refs_v1', {}),
        offlineReady: false,
        notificationState: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
        // Preview mode: an offset on the clock, never saved, so a forgotten preview can't follow the
        // travellers onto the real trip. Live alerts and the app badge ignore it.
        simOffsetMs: 0,
        simInput: '2026-12-03T10:30',
        showSheet: null,
        showCardData: null,
        sheetForm: {},
        sheetView: null,
        storageWarningShown: false,
        nowTick: Date.now(),
        appUpdateAvailable: false,
        semanticQa: { passed: true, checks: 0, issues: [] },
        showGlobalSearch: false,
        globalSearchQuery: '',
        // Deliberately mixed-script: the quick picks double as a hint that Chinese queries
        // work, which is not otherwise discoverable.
        globalSearchSuggestions: ['Jiufen', '九份', 'Ten Drum', 'Lantau', '夜市', 'Hong Kong'],
        destinationPhotos: {
          // Real photos from Wikimedia Commons (credited in Tools → Photo credits).
          taipei: { src: './assets/taipei-photo.webp', label: 'Taipei · 台北', alt: 'Taipei skyline with Taipei 101 seen from Elephant Mountain', credit: {"author": "毛貓大少爺", "license": "CC BY-SA 2.0", "page": "https://commons.wikimedia.org/wiki/File:Taipei_Skyline_2022.06.29.jpg"} },
          kaohsiung: { src: './assets/kaohsiung-photo.webp', label: 'Kaohsiung · 高雄', alt: 'Aerial view of Kaohsiung city and harbour with the 85 Sky Tower', credit: {"author": "臺灣港務股份有限公司高雄港務分公司", "license": "Attribution", "page": "https://commons.wikimedia.org/wiki/File:Cityscape_of_Kaohsiung,_Taiwan_202303.jpg"} },
          hk: { src: './assets/hk-photo.webp', label: 'Hong Kong · 香港', alt: 'Hong Kong Island skyline across Victoria Harbour at dusk', credit: {"author": "Diliff", "license": "CC BY-SA 3.0", "page": "https://commons.wikimedia.org/wiki/File:Hong_Kong_Skyline_Panorama_-_Dec_2008.jpg"} }
        },

        // A photo of the day's own place where the city photo would mislead (Taipei 101 on the
        // Jiufen day, Kaohsiung harbour on the Tainan and Maolin days). Other days keep their city photo.
        dayPhotos: {
          'day-01': { src: './assets/day-01-photo.webp', label: "Flight · 飛行", alt: "Cathay Pacific Airbus A350 taking off", subject: "Cathay Pacific A350", credit: {"author": "BriYYZ from Toronto, Canada", "license": "CC BY-SA 2.0", "page": "https://commons.wikimedia.org/wiki/File:Cathay_Pacific_A350-900_(B-LRJ)_@_DUS,_Dec_2017.jpg"} },
          'day-03': { src: './assets/day-03-photo.webp', label: "Dadaocheng · 大稻埕", alt: "Baroque shophouse facades on Dihua Street, Dadaocheng", subject: "Dihua Street", credit: {"author": "lumoplank", "license": "CC0", "page": "https://commons.wikimedia.org/wiki/File:Dadaocheng,_Taipei_-_Dadaocheng5109.jpg"} },
          'day-04': { src: './assets/day-04-photo.webp', label: "Tamsui · 淡水", alt: "Sunset over the Tamsui River", subject: "Tamsui sunset", credit: {"author": "Minghong", "license": "CC BY-SA 3.0", "page": "https://commons.wikimedia.org/wiki/File:Sunset_of_Tamsui_1.jpg"} },
          'day-05': { src: './assets/day-05-photo.webp', label: "Jiufen · 九份", alt: "Lantern-lit stairs of Jiufen at night", subject: "Jiufen lanterns", credit: {"author": "Sunkenbean", "license": "CC BY-SA 4.0", "page": "https://commons.wikimedia.org/wiki/File:Jiufen_at_night_lantern_glow.jpg"} },
          'day-07': { src: "./assets/day-07-photo.webp", label: "Pier-2 · 駁二", alt: "Old grey warehouses with tiled roofs line a wide brick promenade beside a lawn with black animal-shaped art installations under a clear blue sky.", subject: "Pier-2 Art Center", credit: {"author": "Jonashtand", "license": "CC BY-SA 4.0", "page": "https://commons.wikimedia.org/wiki/File:202407_Penglai_warehouses,_Pier-2_Art_Center,_Kaohsiung.jpg"} },
          'day-08': { src: "./assets/day-08-photo.webp", label: "Ten Drum · 十鼓", alt: "Huge yellow sugar-boiling tanks and catwalks fill the interior of the old Rende sugar factory, with a yellow steel staircase in the foreground.", subject: "Ten Drum Cultural Village (former Rende sugar factory)", credit: {"author": "Mrmarkertw", "license": "CC0", "page": "https://commons.wikimedia.org/wiki/File:2023%E5%B9%B4%E7%9A%84%E5%8D%81%E9%BC%93%E4%BB%81%E7%B3%96%E6%96%87%E5%89%B5%E5%9C%92%E5%8D%80_01.jpg"} },
          'day-09': { src: "./assets/day-09-photo.webp", label: "Maolin · 茂林", alt: "Forested mountain ridges rise steeply above the wide stony bed of the Zhuokou River in Maolin, lit by early morning sun.", subject: "Maolin valley and Zhuokou River", credit: {"author": "Tiouraren (Y.-C. Tsai)", "license": "CC BY-SA 4.0", "page": "https://commons.wikimedia.org/wiki/File:Mount_Weiliao_and_Zhuokou_River_viewed_from_Teldreka.jpg"} },
          'day-12': { src: './assets/day-12-photo.webp', label: "Victoria Peak · 山頂", alt: "Hong Kong skyscrapers and harbour from Victoria Peak", subject: "View from Victoria Peak", credit: {"author": "Estial", "license": "CC BY-SA 4.0", "page": "https://commons.wikimedia.org/wiki/File:Hong_Kong_Skyscrapers.jpg"} },
          'day-13': { src: "./assets/day-13-photo.webp", label: "Lion Rock · 獅子山", alt: "The lion-shaped crag of Lion Rock rises behind the tall blocks of Chuk Yuen public housing estate in Kowloon under a blue sky.", subject: "Lion Rock", credit: {"author": "Mk2010", "license": "CC BY-SA 3.0", "page": "https://commons.wikimedia.org/wiki/File:Lion_Rock,_viewing_from_Lung_Cheung_Road_(Hong_Kong).jpg"} },
          'day-14': { src: './assets/day-14-photo.webp', label: "Ngong Ping · 昂坪", alt: "Tian Tan Buddha on Lantau Island", subject: "Tian Tan Buddha", credit: {"author": "Béria Lima de Rodríguez", "license": "CC BY-SA 3.0", "page": "https://commons.wikimedia.org/wiki/File:Tian_Tan_Buddha_by_Beria.jpg"} },
          'day-15': { src: './assets/day-15-photo.webp', label: "Victoria Harbour · 維港", alt: "Aqua Luna junk with red sails in Victoria Harbour", subject: "Aqua Luna junk", credit: {"author": "Tsugiko", "license": "CC BY 3.0", "page": "https://commons.wikimedia.org/wiki/File:Junk_at_victoria_harbour.jpg"} }
        },

        get destinationPhoto() {
          const own = this.dayPhotos[this.currentDay?.id];
          if (own) return own;
          const city = this.currentCityTheme === 'flight' ? (Number(this.currentDay.dayNum) > 8 ? 'hk' : 'taipei') : this.currentCityTheme;
          return this.destinationPhotos[city] || this.destinationPhotos.taipei;
        },

        get photoCredits() {
          const city = { taipei: 'Taipei skyline', kaohsiung: 'Kaohsiung harbour', hk: 'Hong Kong skyline' };
          return [
            ...Object.entries(this.destinationPhotos).map(([key, p]) => ({ subject: city[key] || p.label, ...p.credit })),
            ...Object.values(this.dayPhotos).map(p => ({ subject: p.subject, ...p.credit }))
          ];
        },

        openPhotoCredits() {
          this.switchTab('toolkit');
          this.$nextTick(() => requestAnimationFrame(() => {
            const credits = document.getElementById('photo-credits');
            credits?.focus({ preventScroll: true });
            credits?.scrollIntoView({ behavior: 'instant', block: 'start' });
          }));
        },

        currencyRates: (() => {
          const cached = getStorage('twhk_fx_rates_v1', null);
          if (cached?.rates?.TWD && cached?.rates?.HKD) {
            return { USD: 1, TWD: Number(cached.rates.TWD), HKD: Number(cached.rates.HKD) };
          }
          // Offline planning fallback only; refreshed from Frankfurter when online.
          return { USD: 1, TWD: 31.486, HKD: 7.82 };
        })(),
        fx: (() => {
          const cached = getStorage('twhk_fx_rates_v1', null);
          return {
            loading: false,
            source: cached?.rates?.TWD && cached?.rates?.HKD ? 'cached' : 'fallback',
            rateDate: cached?.rateDate || null,
            savedAt: Number(cached?.savedAt || 0)
          };
        })(),

        // Persistent User-State IDs only
        completedDayIds: getStorage('twhk_completed_days_v10', []),
        bookedIds: getStorage('twhk_booked_ids_v10', []),
        adminPrepDoneIds: getStorage('twhk_admin_prep_ids_v10', []),

        countdownText: 'Loading...',

        hotels: {
          taipei: {
            name: 'Via Hotel Taipei Station',
            nameTc: '丰居旅店 北車館',
            addressTc: '台北市中正區重慶南路一段60號',
            transit: 'NTU Hospital Exit 4 (~5–7 min) • Taipei Main Z10 (~8–10 min)',
            price: '$974 total (3 rooms / 5N)',
            verificationRequired: false
          },
          kaohsiung: {
            name: 'Airline Inn Kaohsiung Station',
            nameTc: '頭等艙飯店 高雄站前館',
            addressTc: '高雄市三民區建國三路33號',
            transit: '~500 m / ~7–10 min walk from TR Kaohsiung Station & Metro R11 • walk by default; metered taxi only with heavy bags/heat/fatigue',
            price: '$671 total (1 Family Room / 4N)',
            verificationRequired: false
          },
          hk: {
            name: 'Sasa Inn (TST Metro C2)',
            nameTc: '新月賓館（Sasa Inn）',
            addressTc: '香港九龍尖沙咀彌敦道87號華源大廈C座8字樓C1室',
            transit: 'Tsim Sha Tsui MTR Exit C2 (~200 ft) • from Kowloon Station use the red metered taxi stand (~5 min) when carrying luggage',
            price: '$658 total (1 Deluxe Triple / 5N)',
            verificationRequired: false
          }
        },

        adminPrepList: [
          {
            id: 'ap-1',
            title: 'Taiwan Online Arrival Card (TWAC) · opens Nov 22',
            note: 'Submit online within 7 days before arrival at the official NIA site: for your Nov 29 arrival that opens on Nov 22. Paper cards are discontinued; immigration retrieves TWAC electronically upon passport scan.'
          },
          {
            id: 'ap-2',
            title: 'Plan Taiwan Local-Number eSIM · 規劃台灣門號 eSIM',
            note: 'Default: one CHT 10-day 4G tourist SIM/eSIM on the group-admin phone (current NT$500, unlimited data + NT$100 voice). CHT supports prepaid eSIM but final ID verification/issuance is handled through a Taiwan service point; bring passport + a qualifying U.S. government photo ID. Taiwan Mobile currently advertises 10 days for NT$450, but only rely on it if you meet its narrower published foreign secondary-ID rule. Avoid data-only travel eSIMs if you want a +886 number, SMS OTPs and callbacks.'
          },
          {
            id: 'ap-3',
            title: 'Install Ride-Hailing Apps · 安裝叫車工具',
            note: 'Taiwan: keep your existing U.S. Uber account ready; after the Taiwan number activates, optionally register 55688 / LINE GO and compare ETA + price. Prefer app-dispatched rides when the price gap is small; use street/stand yellow taxis only when convenient and confirm the meter starts. Hong Kong: install DiDi Taxi and keep Uber Meter Taxi available.'
          },
          {
            id: 'ap-4',
            title: 'Octopus card — iPhone digital, Samsung physical',
            note: 'iPhone: install the Octopus App for Tourists and add a digital Octopus to Apple Wallet with a non-HK Visa, Mastercard or UnionPay. Samsung / Android: digital Octopus isn\'t available to tourists, so buy a physical Tourist Octopus on arrival at the 7-Eleven in the Arrivals Meeters & Greeters Hall or the MTR Customer Service Centre at Airport Station. In Taipei, Metro gates also take contactless bank cards and Samsung Pay; THSR still needs its own ticket.'
          },
          {
            id: 'ap-5',
            title: 'Lock In Hotel Vouchers & Keys',
            note: 'All 3 bases confirmed: Via Hotel (Taipei), Airline Inn Kaohsiung Station (Family Room), and Sasa Inn (Hong Kong Deluxe Triple).'
          },
          {
            id: 'ap-6',
            title: 'Preinstall Taiwan Savings Apps · 先裝台灣會員 App',
            note: 'U.S. App Store: install OPENPOINT and My FamiPort now; do NOT change Apple ID region. OPENPOINT/uniopen new registration currently requires a +886 Taiwan mobile number, so register only after the local line activates. Then set up FamilyMart membership and check 隨買跨店取 only for protein/drink items you would buy anyway; skip weak deals.'
          },
          {
            id: 'ap-9',
            title: 'Money plan: Capital One + a backup card · 提款與備用卡',
            note: 'Capital One debit has no foreign transaction fee and none of its own for out-of-network ATMs, but an ATM\'s owner may charge one: read the fee screen before confirming. Its debit cards are moving from Mastercard to Discover, so check your logo and bring a Visa or Mastercard credit card as a backup. No travel notice is needed any more (Capital One says so), but check your contact details are current. Details are in Tools → Basics → Money.'
          },
          {
            id: 'ap-10',
            title: 'Check both phones work on Taiwan 4G (VoLTE)',
            note: 'Taiwan\'s 3G network is gone, so a phone without VoLTE on Taiwan networks can\'t make calls, even to 110 or 119. Check the carrier settings on the iPhone and the Samsung before you leave, then install the eSIM.'
          },
          {
            id: 'ap-11',
            title: 'Buy an EasyCard on arrival · 到站買悠遊卡',
            note: 'Buy one per person at the airport MRT, a metro station counter or any 7-Eleven, and top it up with NT$ cash. It covers the metro, buses, TRA trains and 7-Eleven. The Taipei Metro gates also take foreign contactless bank cards (use the same card to tap in and out), so keep the EasyCard as a backup.'
          },
          {
            id: 'ap-8',
            title: 'Watch 2026 Asia Winter Baseball League · 留意冬季聯盟',
            note: 'When the official 2026 schedule is published, check Dec 4–7 for a Kaohsiung-area game at Cheng Ching Lake (CCL) or Kaohsiung Li De (KLD). Add a game only if its exact start time cleanly replaces a weaker block; do not compromise the Dec 6 charter day, the Ten Drum day or the evening shrimp fishing.'
          }
        ],

        bookings: [
          {
            id: 'b-23',
            onDay: false,
            title: 'Return to Taiwan, Double Your Luck — Eligibility Check',
            titleTc: '重遊臺灣・福氣加倍・資格確認與登錄',
            eventDate: 'Taiwan arrival: Sun, Nov 29',
            openDate: 'Open now · register 7–90 days before arrival',
            cost: 'Free',
            url: 'https://5000.taiwan.net.tw/index_en.html',
            notes: 'Needs one traveller who entered Taiwan between Jan 1, 2023 and registration; each can add one friend who hasn\'t. Registration for Nov 29 is open. Mark done once registered or ruled out.'
          },
          {
            id: 'b-28',
            title: 'Lengshuikeng Pickup → Beitou (Qixing Day)',
            titleTc: '冷水坑接送 → 北投',
            eventDate: 'Tue, Dec 01 (~1:15 PM pickup)',
            openDate: 'Arrange the day before',
            cost: 'Taxi fare, split three ways',
            notes: 'Book a ~1:15 PM pickup at Lengshuikeng to Thermal Valley (地熱谷): Uber reservation, 55688 or the Dec 2 driver\'s company. Don\'t rely on a free taxi up there.'
          },
          {
            id: 'b-09',
            title: 'Dec 2 Private Driver — Shifen · Teapot Mountain · Jiufen (~10 h)',
            titleTc: '包車：十分・茶壺山・九份（約10小時）',
            eventDate: 'Wed, Dec 02 (8:30 AM pickup – ~5:30 PM back in Taipei)',
            openDate: 'Book Ahead',
            cost: '~US$45–65/person split three ways',
            notes: '10 hours from Via Hotel; back ~5:30 PM leaves an hour spare. Compare Uber Hourly, Tripool, KKday, Klook. Tripool overtime: NT$500 per 30 min, cash. Send the route: Shifen Waterfall → Quanji Temple / Teapot Mountain → Golden Waterfall → Jiufen → Taipei.'
          },
          {
            id: 'b-13',
            title: 'NARA Thai Massage: 120-min Traditional Bodywork',
            titleTc: 'NARA 泰式養生館・120分鐘傳統泰式',
            eventDate: 'Wed, Dec 02 (8:30 PM – 10:30 PM)',
            openDate: 'Book Ahead',
            cost: 'From NT$1,299 on FunNow (≈ US$40)',
            notes: 'The trip\'s only massage.'
          },
          {
            id: 'b-20',
            title: 'Taipei Zhongzheng Sports Center — Archery + 10m Air Rifle',
            titleTc: '臺北市中正運動中心・射箭＋10公尺空氣步槍',
            eventDate: 'Thu, Dec 03 (Archery ~9:30 AM • Air Rifle 1:00 PM)',
            openDate: 'Recheck 48–72h prior',
            cost: 'Archery NT$300 + air rifle NT$350',
            notes: 'Air rifle: 6F, Tue–Fri 1:00–9:00 PM, NT$350 (gun, coach, target, 30 pellets); tickets at 1F, walk-in only. Archery: 9F, 9:00 AM – 10:00 PM, NT$300 first hour with gear and instruction. Tel 02-2396-1000.'
          },
          {
            id: 'b-04',
            title: 'Taipei 101 Observatory (89F)',
            titleTc: '台北101觀景台',
            eventDate: 'Thu, Dec 03 (~2:20 PM)',
            openDate: 'Check ticket options (standard 89F; no Skyline 460)',
            cost: 'NT$600 adult (≈ US$18)',
            url: 'https://www.taipei-101.com.tw/',
            notes: '89F only; buy online or at the counter.'
          },
          {
            id: 'b-02',
            title: 'THSR Bullet Train: Taipei → Zuoying',
            titleTc: '台灣高鐵：台北站 → 左營站',
            eventDate: 'Fri, Dec 04 (train 0615 at 8:46 AM or 1307 at 9:01 AM)',
            openDate: '2026-11-06',
            cost: 'NT$1,490/person',
            url: 'https://www.thsrc.com.tw/',
            notes: 'Book 0615 (8:46 AM → 10:45) or 1307 (9:01 AM → 11:00); 0207 (8:31 AM → 10:10) if out early. Reserved seats; opens 29 days ahead.'
          },
          {
            id: 'b-29',
            onDay: false,
            title: 'Boulder Space Zuoying — Hours & Price Check',
            titleTc: 'Boulder Space 圓石空間・營業時間與價格確認',
            eventDate: 'Fri, Dec 04 (11:45 AM climb)',
            openDate: 'Check a few days before',
            cost: 'NT$350 entry + NT$80 shoes (≈ US$13)',
            notes: 'Walk-in. Only the mall floor\'s hours are published (Fri 11:00 AM – 10:00 PM); check the day before.'
          },
          {
            id: 'b-32',
            onDay: false,
            title: 'Mini Suzuka Kart — Walk-In Check',
            titleTc: '鈴鹿賽道樂園・卡丁車（現場）',
            eventDate: 'Fri, Dec 04 (~5:30 PM)',
            openDate: 'No booking — walk in',
            cost: 'NT$650 per ride (weekday) + NT$100 briefing fee',
            url: 'https://www.suzukacircuitpark.com/Ticket',
            notes: 'Fri 11:00 AM – 8:30 PM; last tickets 30 min before close. 155 cm+, long trousers, closed shoes. Skip if the wait is over ~30 min.'
          },
          {
            id: 'b-24',
            title: 'Ten Drum Cultural Village — Online Ticket',
            titleTc: '十鼓文創園區・線上購票',
            eventDate: 'Sat, Dec 05 (9:30 AM opening)',
            openDate: 'Book Ahead',
            cost: 'NT$458 online (NT$509 at the gate)',
            url: 'https://tendrum.com.tw/TpLandTicket/zt',
            notes: 'Online price via Ten Drum\'s LINE; includes one drum show. Sat 9:30 AM – 5:50 PM.'
          },
          {
            id: 'b-25',
            title: 'Dec 6 Private Charter — Maolin · Qishan (12 h)',
            titleTc: '包車：茂林・旗山・瑞豐（12小時）',
            eventDate: 'Sun, Dec 06 (7:15 AM pickup, 12 hours)',
            openDate: 'Book Ahead',
            cost: '~US$55–65/person split three ways',
            notes: 'Book 12 hours (10 ends at 5:15 PM; procession times unpublished). Tripool (overtime NT$500 per 30 min), KKday / Klook or 55688 — not Uber Hourly. Tell the driver the Mazu timing may move.'
          },
          {
            id: 'b-30',
            onDay: false,
            title: 'Qishan Mazu Procession Schedule (Dec 6)',
            titleTc: '旗鹿同福・媽祖遶境時程',
            eventDate: 'Sun, Dec 06',
            openDate: 'Watch for the organiser\'s timetable',
            cost: 'Free',
            url: 'https://khh.travel/zh-tw/event/calendardetail/8049/',
            notes: 'Times follow organiser announcements. If it starts early, go straight to Qishan after the market; never cut the butterflies.'
          },
          {
            id: 'b-31',
            onDay: false,
            title: 'Qingshan King Procession Route (Nov 30)',
            titleTc: '艋舺青山王祭・遶境路線',
            eventDate: 'Mon, Nov 30',
            openDate: 'Watch for the published route (Nov 28–30)',
            cost: 'Free',
            url: 'https://www.travel.taipei/zh-tw/event-calendar/details/66400',
            notes: 'Route posted Oct 20: troupes leave 9:00 AM from Lane 170, Dali Street; palanquin 11:00 AM. Intercept it on the move.'
          },
          {
            id: 'b-33',
            onDay: false,
            title: 'Shrimp Fishing — Call Ahead (佰吉星釣蝦競技場)',
            titleTc: '佰吉星釣蝦競技場・先打電話',
            eventDate: 'Mon, Dec 07 (~4:00 PM session)',
            openDate: 'Call a day or two before',
            cost: 'Rod pricing not published — ask',
            notes: 'Ask: rod price per hour, can three share two rods, can they grill the catch. Aim for 4:00–6:00 PM; 6:00–8:00 PM fallback.'
          },
          {
            id: 'b-03',
            title: 'THSR Bullet Train: Zuoying → Taoyuan',
            titleTc: '台灣高鐵：左營站 → 桃園站',
            eventDate: 'Tue, Dec 08 (train 0622, 9:35 AM)',
            openDate: '2026-11-10',
            cost: 'NT$1,330/person',
            url: 'https://www.thsrc.com.tw/',
            notes: 'Train 0622: Zuoying 9:35 AM → Taoyuan 11:09; 11:17 Airport MRT reaches T1 ~11:36, before the 12:20 counter close for CX495. Earlier: 0618 at 9:00 → 10:36. Opens 29 days ahead.'
          },
          {
            id: 'b-26',
            title: 'WTT Finals Hong Kong — CAT 2 (Kai Tak Arena)',
            titleTc: 'WTT 總決賽香港站・CAT 2（啟德體藝館）',
            eventDate: 'Thu, Dec 10 (session time on your ticket; ~6:00 PM expected)',
            openDate: 'On sale now — public sale opened Oct 23 (HKTicketing, Damai)',
            cost: 'HK$680 CAT 2 (+ ticketing fee)',
            url: 'https://www.kaitaksportspark.com.hk/events-tickets/wtt-finals-hong-kong-2026',
            notes: 'A central sideline seat beats the category: take a central CAT 3 over a CAT 2 corner. No courtside.'
          },
          {
            id: 'b-19',
            title: 'Yat Tung Heen — Michelin-Star Dim Sum Brunch',
            titleTc: '逸東軒・米芝蓮一星點心',
            eventDate: 'Sat, Dec 12 (10:00 AM)',
            openDate: 'Book / Confirm Ahead',
            cost: '~US$30–40/person à la carte',
            notes: 'The trip\'s starred meal. À la carte: dim sum, char siu, roast meat, a vegetable, rice or noodles.'
          },
          {
            id: 'b-06',
            title: 'Aqua Luna Evening Harbour Cruise',
            titleTc: '張保仔號・維港傍晚航程',
            eventDate: 'Sat, Dec 12 (5:30 PM TST Pier 1)',
            openDate: 'Book Ahead',
            cost: 'HK$280/adult (≈ US$36)',
            url: 'https://aqualuna.com.hk/experiences/evening-harbour-cruise/',
            notes: 'Check in at TST Pier 1 by 5:10 PM for the 5:30 PM sailing. Drink included (non-alcoholic available).'
          }
        ],

        days: [
          {
            id: 'day-01',
            dayNum: '01',
            shortLabel: 'Flight / 飛行',
            city: 'Flight / 飛行',
            dateString: 'Sat, Nov 28, 2026',
            timeZone: 'America/New_York',
            title: 'JFK Departure → Transpacific Crossing',
            titleTc: 'JFK 出發・跨太平洋飛行',
            hotelRef: null,
            transitSummary: 'Cathay Pacific CX841 nonstop, ~16 h 05 min.',
            weatherExpected: 'In-flight climate',
            leaveByTime: 'At JFK by 6:15 AM',
            timeline: [
              {
                time: '6:15 AM',
                title: 'Arrive at JFK Terminal 8 (Cathay Pacific Desk)',
                titleTc: '甘迺迪國際機場第八航站樓',
                icon: 'plane-takeoff',
                notes: '9:00 AM CX841 to HKG; tag all three bags through to TPE. No published counter-closing time; boarding pass and screens are final.',
                navigateTo: 'Terminal 8, John F. Kennedy International Airport, Queens, NY',
                guide: {
                  intro: 'Terminal 8 departure flow for CX841 nonstop to Hong Kong with baggage through-check to Taipei.',
                  steps: [
                    {
                      label: 'Before leaving',
                      detail: '35–45 g protein breakfast; check live TSA wait on the JFK T8 page.'
                    },
                    {
                      label: 'TWAC cards',
                      detail: 'All three filed; valid within 7 days of arrival (from ~Nov 23).'
                    },
                    {
                      label: 'Check in',
                      detail: 'Online check-in, bag drop; confirm bags tagged to TPE via HKG; photograph tags.'
                    },
                    {
                      label: 'At gate',
                      detail: 'Gates 1–20: 2–5 min walk; 31–47: 6–12 min. Charge power banks; download offline Maps.'
                    }
                  ]
                }
              },
              {
                time: '9:00 AM',
                startAt: '2026-11-28T09:00:00-05:00',
                endAt: '2026-11-29T14:05:00+08:00',
                title: 'Board Flight CX841 to Hong Kong',
                titleTc: '國泰航空 CX841：紐約甘迺迪 → 香港',
                icon: 'plane',
                notes: 'Lands HKG ~2:05 PM Nov 29. Stay awake first, then one long sleep timed to Taipei night.',
                noMap: true,
                guide: {
                  intro: 'Transpacific flight routine to help adjust to East Asia time before landing.',
                  steps: [
                    {
                      label: 'Clocks',
                      detail: 'Set phones to Taipei time (UTC+8, 13 hours ahead of New York).'
                    },
                    {
                      label: 'Stay awake',
                      detail: 'Through take-off and first meal; protein first; water, not alcohol.'
                    },
                    {
                      label: 'Sleep',
                      detail: 'Eye mask and earplugs; one long sleep matched to Taipei night.'
                    },
                    {
                      label: 'On landing',
                      detail: 'Check the CX472 gate in the Cathay app.'
                    }
                  ]
                }
              }
            ],
            foodRecommendation: 'Cathay Pacific onboard meals; no JFK restaurant stop.',
            proteinHeadline: 'No whey · food ~150 g',
            proteinPlan: 'No whey: 35–45 g protein breakfast, 1–2 protein bars, protein first at each meal.',
            insiderTip: 'Download offline podcasts and entertainment before boarding.'
          },
          {
            id: 'day-02',
            dayNum: '02',
            shortLabel: 'Arrival / 抵達',
            city: 'Taipei / 台北',
            dateString: 'Sun, Nov 29, 2026',
            timeZone: 'Asia/Taipei',
            title: 'HKG Connection → Taipei → Ximending Night',
            titleTc: '香港轉機・抵達台北・西門町夜晚',
            hotelRef: 'taipei',
            transitSummary: 'CX472 → Express Airport MRT (~39 min) → walk.',
            weatherExpected: '~68°F • Mild evening conditions',
            easyPlan: 'Jet lag hits hard: skip Ximending.',
            leaveByTime: '5:35 PM on landing',
            timeline: [
              {
                time: '2:05 PM – 3:45 PM',
                title: 'Hong Kong Connection: CX841 Arrival → CX472 Boarding (~1h40 Transit)',
                titleTc: '香港國際機場轉機（CX472）',
                icon: 'plane',
                notes: '~1 h 40 min to reach the CX472 gate. Stay airside; transfer security is mandatory.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Off plane',
                      detail: 'Follow Flight Connections signs to Departures; never Arrivals or immigration.'
                    },
                    {
                      label: 'Security',
                      detail: 'Passport and CX472 boarding pass ready; sealed duty-free liquids get extra screening.'
                    },
                    {
                      label: 'Power banks',
                      detail: 'Two per person max, carry-on only; no in-flight recharging.'
                    },
                    {
                      label: 'To gate',
                      detail: 'Check CX472 gate on screens or app; bags through to TPE.'
                    }
                  ]
                }
              },
              {
                time: '3:45 PM – 5:35 PM',
                title: 'Cathay Pacific CX472: Hong Kong → Taipei',
                titleTc: '國泰航空 CX472：香港 → 台北桃園',
                icon: 'plane',
                notes: 'Lands TPE Terminal 1; often late (recent landings 5:17–6:31 PM). Live gate info is final.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'On board',
                      detail: 'Protein first, drink water; Fuhong dinner at 8:00 PM.'
                    },
                    {
                      label: 'Paperwork',
                      detail: 'None; TWAC read from passport scan.'
                    },
                    {
                      label: 'Before landing',
                      detail: 'Passports in front pocket; agree who collects bags, who buys EasyCards.'
                    }
                  ]
                }
              },
              {
                time: '5:35 PM – ~7:20 PM',
                title: 'Touchdown TPE T1: Immigration → Bags → EasyCard → Airport MRT',
                titleTc: '桃園機場第一航廈：入境・行李・悠遊卡・機場捷運',
                icon: 'plane-landing',
                notes: 'Express Airport MRT T1 (A12) → Taipei Main (A1): ~39 min, NT$160. Taxi only if badly delayed; last express 10:58 PM.',
                navigateTo: 'Airport MRT Terminal 1 Station A12, Dayuan District',
                guide: {
                  intro: 'One clean sweep from the gate to the hotel.',
                  steps: [
                    {
                      label: 'Immigration',
                      detail: 'Passports at counter (no paper card), then collect three bags.'
                    },
                    {
                      label: 'EasyCards',
                      detail: 'One each at A12 (NT$100 card); load NT$160 plus a few days. Backup: contactless card.'
                    },
                    {
                      label: 'Express only',
                      detail: 'Purple Express to A1, every ~7.5 min; skip the commuter (53 min).'
                    },
                    {
                      label: 'To hotel',
                      detail: 'Exit Z10, 8–10 min walk to No. 60 Chongqing S. Rd. Sec. 1.'
                    }
                  ]
                }
              },
              {
                time: '~7:30 PM – 8:00 PM',
                title: 'Check In: Via Hotel Taipei Station — Bags Down',
                titleTc: '丰居旅店 北車館・放下行李',
                icon: 'building-2',
                notes: '丰居旅店 北車館, 台北市中正區重慶南路一段60號, tel +886-2-2314-2121. Check-in from 3:00 PM; check-out by 12:00 noon.',
                navigateTo: '台北市中正區重慶南路一段60號',
                addressTc: '台北市中正區重慶南路一段60號',
                guide: {
                  steps: [
                    {
                      label: 'Front desk',
                      detail: 'Three passports and booking name.'
                    },
                    {
                      label: 'Bags down',
                      detail: 'Charge phones and power banks; unpack tomorrow.'
                    },
                    {
                      label: 'Leave by',
                      detail: '8:00 PM; walk to Fuhong, 洛陽街67號.'
                    }
                  ]
                }
              },
              {
                time: '8:00 PM – 8:50 PM',
                title: 'Fuhong Beef Noodles (backup: Xiao Wu) — Arrival Dinner',
                titleTc: '富宏牛肉麵（備案：小吳牛肉麵）',
                icon: 'utensils',
                notes: 'Fuhong 富宏牛肉麵, 洛陽街67號; backup Xiao Wu 小吳牛肉麵, 洛陽街45-11號. Both 24 hours. Fuhong queue: go to Xiao Wu.',
                navigateTo: '富宏牛肉麵 台北市萬華區洛陽街',
                addressTc: '台北市萬華區洛陽街67號',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Each: beef noodle soup, extra beef (加肉), braised egg (滷蛋); share 豆干.'
                    },
                    {
                      label: 'Still hungry',
                      detail: 'Add 滷肉飯, chicken rice or dumplings for 40–50 g.'
                    },
                    {
                      label: 'Pay',
                      detail: 'Bring cash.'
                    },
                    {
                      label: 'Then',
                      detail: 'By 9:00 PM, walk to POYA, 昆明街98之4號.'
                    }
                  ]
                }
              },
              {
                time: '9:00 PM – 9:30 PM',
                title: 'Protein Run — POYA Shaker + PX Mart Whey',
                titleTc: '補給：寶雅搖搖杯＋全聯乳清',
                icon: 'shopping-bag',
                notes: 'POYA 寶雅, 昆明街98之4號, 10:00 AM – 11:00 PM. PX Mart 全聯, 長沙街2段110號, 8:00 AM – 11:00 PM. Budget ~NT$1,200 for whey.',
                navigateTo: '寶雅 台北西門店 昆明街98之4號',
                addressTc: '台北市萬華區昆明街98之4號1樓',
                guide: {
                  intro: 'One walking loop with Ximending — not a separate errand.',
                  steps: [
                    {
                      label: 'POYA',
                      detail: 'Shaker: 綠貝勁能搖搖杯 500 mL (~NT$119–149); bag clip if needed.'
                    },
                    {
                      label: 'PX whey',
                      detail: '豐力富即溶濃縮乳清蛋白粉 900 g or 450 g × 2; NT$899 sale, NT$1,188 list.'
                    },
                    {
                      label: 'Breakfast',
                      detail: 'One 無糖濃豆漿 (unsweetened thick soy milk) each for tomorrow.'
                    },
                    {
                      label: 'Then',
                      detail: 'Drop bag at hotel or carry into Ximending.'
                    }
                  ],
                  exit: 'Both close 11:00 PM. No Fernleaf: any plain whey ~70%+ protein.'
                }
              },
              {
                time: '9:30 PM – 10:30 PM',
                title: 'Ximending at Night',
                titleTc: '西門町夜晚',
                icon: 'sparkles',
                notes: 'One dessert, one street-food bite; no serious shopping or 30-minute queues. Red House (成都路10號) closes 9:00 PM Sundays: outside only.',
                navigateTo: '西門紅樓',
                addressTc: '台北市萬華區成都路10號（西門紅樓）',
                guide: {
                  intro: 'Easiest night of the trip.',
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Hanzhong St (漢中街), Wuchang St (武昌街) to Red House; MRT Ximen Exit 1.'
                    },
                    {
                      label: 'Games',
                      detail: 'Ten minutes at one arcade or claw shop (夾娃娃機店).'
                    },
                    {
                      label: 'Eat',
                      detail: 'No-queue stalls: 烤香腸 (grilled sausage) or 雞排 (chicken cutlet).'
                    },
                    {
                      label: '10:30 PM',
                      detail: 'Default: hotel. All fresh: arcade to ~11:15 PM. Jet-lagged: skip entirely.'
                    }
                  ]
                }
              },
              {
                time: '~10:45 PM – 11:00 PM',
                title: 'Back to Via Hotel',
                titleTc: '返回丰居旅店',
                icon: 'building-2',
                notes: 'Shower, sleep. Leave hotel 8:30 AM tomorrow.',
                navigateTo: '台北市中正區重慶南路一段60號',
                addressTc: '台北市中正區重慶南路一段60號',
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Blue Line Ximen → Taipei Main; Exit Z10, ~8 min walk to No. 60.'
                    },
                    {
                      label: 'Before bed',
                      detail: 'Set out shaker, 25 g scoop, soy milk; charge devices; alarms 8:30 AM.'
                    }
                  ]
                }
              }
            ],
            backups: {
              foods: [
                {
                  title: 'Xiao Wu Beef Noodles',
                  titleTc: '小吳牛肉麵',
                  note: 'Same street as Fuhong; the beef noodle backup if Fuhong has a long queue.',
                  navigateTo: '台北市萬華區洛陽街45-11號'
                }
              ],
              services: [
                {
                  title: 'PX Mart Wanhua Changsha (whey, soy milk)',
                  titleTc: '全聯 萬華長沙店',
                  note: '臺北市萬華區長沙街2段110號, open 8:00 AM – 11:00 PM, a few minutes\' walk from POYA. Whey, soy milk, eggs and chicken breast.',
                  navigateTo: '全聯 萬華長沙店 長沙街二段110號'
                }
              ]
            },
            foodRecommendation: 'Fuhong Beef Noodles 富宏牛肉麵; backup Xiao Wu Beef Noodles 小吳牛肉麵.',
            proteinHeadline: 'Up to 50 g whey · dinner ~40–50 g',
            proteinPlan: 'Two scoops only if flights left you short; beef noodles extra meat; skip a scoop at ~150 g food.',
            insiderTip: 'Most days end 11:30 PM – midnight; tonight ends earlier.'
          },
          {
            id: 'day-03',
            dayNum: '03',
            shortLabel: 'Monga / 艋舺',
            city: 'Taipei / 台北',
            dateString: 'Mon, Nov 30, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Dadaocheng → Qingshan Festival Passes → Wanhua → Late Games',
            titleTc: '大稻埕・青山王祭（分段）・萬華・夜間遊戲',
            hotelRef: 'taipei',
            transitSummary: 'Green Line to Beimen (G13) + walk → taxi to Wanhua → walk → taxi to Sanchong and back.',
            weatherExpected: '~72°F • Typically mild/drier season',
            rainBackupAvailable: true,
            easyPlan: 'Festival: 45–60 min per pass; ~2 hours total, 3 hours max.',
            rainPlan: 'Light rain: ponchos, procession runs. Severe: Yongle Market, covered Dihua shops, then eat in Wanhua.',
            leaveByTime: '8:30 AM from hotel',
            timeline: [
              {
                time: '9:00 AM – 10:00 AM',
                title: 'Dadaocheng / Dihua Street — Yongle Market, Dry Goods, Tea',
                titleTc: '大稻埕・迪化街：永樂市場・南北貨・茶行',
                icon: 'store',
                notes: 'Yongle Market (迪化街一段21號), then north; breakfast from street stalls. Monday: ground-floor food market closed; 2F–3F fabric 9:00 AM – 6:00 PM.',
                navigateTo: '永樂市場 迪化街一段21號',
                addressTc: '台北市大同區迪化街一段21號',
                guide: {
                  intro: 'Working Dihua Street in an hour.',
                  steps: [
                    {
                      label: 'Get there',
                      detail: 'Leave 8:30 AM: taxi, or Blue → Green at Ximen to Beimen (G13), Exit 3.'
                    },
                    {
                      label: 'Market',
                      detail: 'Yongle 2F–3F fabric, ten minutes max; north past dry goods (南北貨).'
                    },
                    {
                      label: 'Tea',
                      detail: 'Pouchong or Oriental Beauty: 有記名茶 (重慶北路二段64巷26號, Mon–Sat 9:00 AM – 6:00 PM) or 林華泰茶行.'
                    },
                    {
                      label: 'Leave by',
                      detail: '10:00 AM, north to 賣麵炎仔, 安西街106號.'
                    }
                  ]
                }
              },
              {
                time: '10:00 AM – 10:40 AM',
                title: 'Early Lunch — Traditional Dadaocheng / Wanhua Corridor',
                titleTc: '大稻埕／萬華傳統早午餐',
                icon: 'utensils',
                notes: '賣麵炎仔 (金泉小吃, 安西街106號); queue grows toward noon. Reportedly cash only; phone 02-2557-7087 that morning to confirm open.',
                navigateTo: '台北市大同區安西街106號',
                addressTc: '台北市大同區安西街106號',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: '紅燒肉 (red-fermented pork), 白斬雞 (boiled chicken) or 下水湯 (offal soup), plus 湯麵, not dry.'
                    },
                    {
                      label: 'Protein',
                      detail: 'Pork or chicken plus a meat side each: 35–40 g.'
                    },
                    {
                      label: 'Queue rule',
                      detail: 'Not clearing in ~15 min: nearest seated rice shop, pork or chicken rice.'
                    },
                    {
                      label: 'Leave by',
                      detail: '10:40 AM; taxi from the nearest main road.'
                    }
                  ]
                }
              },
              {
                time: '10:40 AM – 11:00 AM',
                title: 'Taxi to Wanhua',
                titleTc: '計程車往萬華',
                icon: 'car',
                notes: 'Taxi for three, ~20 min, to 大理街170巷口 (Lane 170, Dali St). Walk in; never taxi into the procession.',
                navigateTo: '台北市萬華區大理街170巷',
                addressTc: '台北市萬華區大理街170巷口',
                guide: {
                  steps: [
                    {
                      label: 'Hail',
                      detail: 'Main road; cash. NT$85 first 1.25 km, then NT$5 per 200 m.'
                    },
                    {
                      label: 'Destination',
                      detail: 'Ask for 萬華 大理街170巷口; get out a block or two short.'
                    },
                    {
                      label: 'Arrive by',
                      detail: 'Before 11:00 AM, when the palanquin sets off.'
                    }
                  ]
                }
              },
              {
                time: '11:00 AM – 12:00 PM',
                title: 'Qingshan Festival — Pass 1 (Main Procession Day)',
                titleTc: '艋舺青山王祭・正日遶境',
                icon: 'sparkles',
                notes: 'Leave after ~60 minutes, even if still running. Nov 30 main daytime procession (正日遶境), free.',
                navigateTo: '台北市萬華區大理街170巷',
                addressTc: '台北市萬華區大理街170巷口',
                guide: {
                  intro: 'Living local culture — the reason this temple event is on the plan.',
                  steps: [
                    {
                      label: 'Start',
                      detail: 'At 大理街170巷口 before 11:00 AM; don\'t wait at the temple.'
                    },
                    {
                      label: 'Route',
                      detail: 'Follow the Oct 20 map (Facebook qingshantemple); red arrows show direction.'
                    },
                    {
                      label: 'Watch',
                      detail: 'Eight Generals (八將), palanquins, route altars. No floats today (藝閣 Nov 28–29 only).'
                    },
                    {
                      label: 'Leave by',
                      detail: '12:00 PM; walk to Longshan Temple (廣州街211號). Temple phone 02-2382-2296.'
                    }
                  ],
                  recheck: 'Morning of: temple Facebook (qingshantemple) for where it\'s running.'
                },
                live: {
                  label: 'Route & updates',
                  url: 'https://www.travel.taipei/zh-tw/event-calendar/details/66400'
                }
              },
              {
                time: '12:05 PM – 12:45 PM',
                title: 'Longshan Temple / Bopiliao / Wanhua Streets',
                titleTc: '龍山寺・剝皮寮・萬華街區',
                icon: 'landmark',
                notes: 'Longshan Temple (艋舺龍山寺, 廣州街211號) 15 minutes max. Bopiliao (剝皮寮) closed Mondays: outside only.',
                navigateTo: '艋舺龍山寺',
                addressTc: '台北市萬華區廣州街211號',
                guide: {
                  steps: [
                    {
                      label: 'Longshan',
                      detail: 'In by the right (dragon) door, out by the left (tiger) door.'
                    },
                    {
                      label: 'Herb Lane',
                      detail: '青草巷, 西昌街224巷, beside the temple; 青草茶 if thirsty.'
                    },
                    {
                      label: 'Leave by',
                      detail: '12:45 PM: short taxi to Nanjichang (中華路二段307巷).'
                    }
                  ]
                }
              },
              {
                time: '12:45 PM – 1:30 PM',
                title: 'Wanhua / Nanjichang Food Break',
                titleTc: '萬華／南機場・小吃休息',
                icon: 'utensils',
                notes: '南機場夜市, Lanes 307–315, Sec. 2 Zhonghua Rd. Open now: 山內雞肉 (11:00 AM – 9:00 PM), 曉迪筒仔米糕 (11:00 AM – 10:00 PM); both closed Saturdays.',
                navigateTo: '台北市中正區中華路二段307巷',
                addressTc: '台北市中正區中華路二段307巷',
                guide: {
                  steps: [
                    {
                      label: 'At 山內',
                      detail: 'Boneless thigh rice NT$140, chicken rice NT$130, shank rice NT$120; full soup NT$150.'
                    },
                    {
                      label: 'Or 曉迪',
                      detail: 'Braised pork belly (滷控肉) or rib (滷排骨) NT$70; egg/tofu NT$15; 筒仔米糕 NT$45.'
                    },
                    {
                      label: 'Check stalls',
                      detail: 'Urban renewal on Lane 307; confirm each stall; on-site boards prevail.'
                    },
                    {
                      label: 'Leave by',
                      detail: '1:30 PM; grab soy milk or tea eggs for later.'
                    }
                  ]
                }
              },
              {
                time: '1:45 PM – 2:45 PM',
                title: 'Qingshan Festival — Pass 2 (Only If Active Nearby)',
                titleTc: '青山王祭・第二段（如在附近）',
                icon: 'sparkles',
                notes: 'Only if active now, on a different stretch, and reachable without waiting. Staging or waiting: leave immediately.',
                navigateTo: '台北市萬華區大理街170巷',
                addressTc: '台北市萬華區大理街170巷口',
                guide: {
                  steps: [
                    {
                      label: 'Check',
                      detail: '1:30 PM: Facebook (qingshantemple); listen for drums and firecrackers.'
                    },
                    {
                      label: 'Skip rule',
                      detail: 'Any test fails: go straight to Ximending.'
                    },
                    {
                      label: 'Intercept',
                      detail: 'Reach a corner ahead on the route; walk alongside.'
                    },
                    {
                      label: 'Leave by',
                      detail: '2:45 PM: Blue Line, Longshan Temple (BL10) to Ximen (BL11).'
                    }
                  ]
                },
                live: {
                  label: 'Route & updates',
                  url: 'https://www.travel.taipei/zh-tw/event-calendar/details/66400'
                }
              },
              {
                time: '3:00 PM – 4:00 PM',
                title: 'Ximending Games / Coffee / Dessert',
                titleTc: '西門町・遊戲・咖啡・甜點',
                icon: 'gamepad-2',
                notes: 'Games, then coffee and dessert; no broad shopping. Red House closed Mondays.',
                navigateTo: '西門紅樓',
                addressTc: '台北市萬華區成都路10號（西門紅樓）',
                guide: {
                  steps: [
                    {
                      label: 'Arcade',
                      detail: 'One big arcade, 30–40 minutes; claw shop (夾娃娃機店) 10 minutes, fixed coin budget.'
                    },
                    {
                      label: 'Coffee',
                      detail: 'Fong Da Coffee (蜂大咖啡, 成都路42號).'
                    },
                    {
                      label: 'Dessert',
                      detail: '豆花 (douhua) with peanuts, or 刨冰 (shaved ice).'
                    },
                    {
                      label: 'Leave by',
                      detail: '4:00 PM: Blue Line, Ximen (BL11) to Longshan Temple (BL10), Exit 1.'
                    }
                  ]
                }
              },
              {
                time: '4:15 PM – 5:00 PM',
                title: 'Huaxi / Wanhua Street-Life Loop',
                titleTc: '華西街・萬華街頭',
                icon: 'footprints',
                notes: 'Huaxi Street Tourist Night Market (華西街觀光夜市) and streets round Longshan Temple. One snack, not a meal: dinner 7:15 PM. Traditional markets closed Mondays.',
                navigateTo: '華西街觀光夜市',
                addressTc: '台北市萬華區華西街',
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'In through the Guangzhou St gate, arcade to the end and back.'
                    },
                    {
                      label: 'Snack',
                      detail: '小王煮瓜 (華西街17-4號, stall 153; 9:30 AM – 8:00 PM, closed Tuesdays).'
                    },
                    {
                      label: 'Order',
                      detail: '滷肉飯 and 瓜仔肉湯 (minced pork with pickles in broth).'
                    },
                    {
                      label: 'Leave by',
                      detail: '5:00 PM; rest before Pass 3 with soy milk or eggs.'
                    }
                  ]
                }
              },
              {
                time: '~6:00 PM – 7:00 PM',
                title: 'Qingshan Festival — Pass 3 (Optional, Night)',
                titleTc: '回到遶境與廟會街區',
                icon: 'sparkles',
                notes: 'Optional; no official end time. Festival total ~2 hours, hard max 3; don\'t follow it to 10:00 PM.',
                navigateTo: '台北市萬華區貴陽街二段218號',
                addressTc: '台北市萬華區貴陽街二段218號',
                guide: {
                  steps: [
                    {
                      label: 'Check',
                      detail: '~5:45 PM: Facebook (qingshantemple); go to 青山宮, 貴陽街二段218號, or intercept.'
                    },
                    {
                      label: 'Count',
                      detail: 'Running total across all passes; stop at 3 hours.'
                    },
                    {
                      label: 'Gone quiet',
                      detail: 'Straight to dinner; Bopiliao is closed Mondays.'
                    },
                    {
                      label: 'Leave by',
                      detail: '7:00 PM; short taxi or walk to dinner.'
                    }
                  ]
                },
                live: {
                  label: 'Route & updates',
                  url: 'https://www.travel.taipei/zh-tw/event-calendar/details/66400'
                }
              },
              {
                time: '7:15 PM – 8:00 PM',
                title: 'Wanhua Dinner',
                titleTc: '萬華晚餐',
                icon: 'utensils',
                notes: 'Default Nanjichang (Lanes 307–315, Sec. 2 Zhonghua Rd); 勳章 and 八棟 have occasional closures. Leave 8:00 PM: taxi to E7PLAY.',
                navigateTo: '台北市中正區中華路二段307巷',
                addressTc: '台北市中正區中華路二段307巷',
                guide: {
                  steps: [
                    {
                      label: 'Chicken',
                      detail: '好吃鹽水雞 (5:00 PM – midnight): breast NT$70, leg NT$85, or set 3 NT$260.'
                    },
                    {
                      label: 'Braised',
                      detail: '勳章滷味 (5:00 – 11:30 PM): beef shank or tendon NT$68, chicken thigh NT$58.'
                    },
                    {
                      label: 'Rice',
                      detail: '曉迪 (to 10:00 PM): pork rice NT$35, 筒仔米糕 NT$45, egg/tofu NT$15.'
                    },
                    {
                      label: 'Dessert',
                      detail: '八棟 peanut soup NT$75 (to midnight) or 龍都冰菓 (和平西路3段192號) shaved ice.'
                    }
                  ]
                }
              },
              {
                time: '8:00 PM – 10:30 PM',
                title: 'E7PLAY Sanchong — Bowling, Billiards, Darts (Plan A)',
                titleTc: 'E7PLAY 三重店・保齡球・撞球・飛鏢',
                icon: 'gamepad-2',
                notes: 'B1–B3, 新北市三重區中央南路63號, by MRT Taipei Bridge; 24 hours. Leave ~10:30 PM. Plan B: one 30–45-min festival interception. Plan C, tired: late food, hotel.',
                navigateTo: 'E7PLAY 三重店 中央南路63號',
                addressTc: '新北市三重區中央南路63號',
                guide: {
                  steps: [
                    {
                      label: 'Find it',
                      detail: 'Lane at the Shin Kong Bank corner. Visa, Mastercard, JCB, LINE Pay, TWQR.'
                    },
                    {
                      label: 'Tickets',
                      detail: 'Weekday 3 h NT$290, 5 h NT$330, +10% cleaning; overtime NT$30/30 min.'
                    },
                    {
                      label: 'Bowling first',
                      detail: 'Lanes in 30-minute slots, extended in 15-minute blocks; full: rebook, play pool.'
                    },
                    {
                      label: 'Bring ID',
                      detail: 'Darts, KTV, massage rooms need passport plus ticket.'
                    }
                  ]
                }
              },
              {
                time: '~11:15 PM – 11:45 PM',
                title: 'Back to Via Hotel',
                titleTc: '返回丰居旅店',
                icon: 'building-2',
                notes: 'Taxi to Via Hotel (台北市中正區重慶南路一段60號), tel +886-2-2314-2121. From 11:00 PM: NT$20 night surcharge, by boarding time.',
                navigateTo: '台北市中正區重慶南路一段60號',
                addressTc: '台北市中正區重慶南路一段60號',
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'Hail on 中央南路 outside E7PLAY; show the hotel address in Chinese.'
                    },
                    {
                      label: 'MRT option',
                      detail: 'From Wanhua: Blue Line BL10 → Taipei Main (BL12), Exit Z10; check last train.'
                    },
                    {
                      label: 'Before bed',
                      detail: '25 g whey scoop; lay out hiking layers, fill bottles. Leave 8:15 AM.'
                    }
                  ]
                }
              }
            ],
            backups: {
              activity: {
                title: 'Plan B: one last festival interception',
                titleTc: '備案：最後一次攔截遶境',
                note: 'Only if the night procession is genuinely exceptional: 30–45 minutes, then late food and back to the hotel.',
                navigateTo: '台北市萬華區大理街170巷'
              },
              foods: [
                {
                  title: 'Nanjichang Night Market',
                  titleTc: '南機場夜市',
                  note: 'Cooked-food stalls near the Wanhua end of the day.',
                  navigateTo: '台北市中正區中華路二段307巷'
                }
              ]
            },
            foodRecommendation: 'Dihua snacks → early lunch (賣麵炎仔 if short queue) → Wanhua / 南機場 food.',
            proteinHeadline: '50 g whey · food ~100 g',
            proteinPlan: '25 g breakfast + 25 g at hotel; lunch: pork or chicken rice, meat side (35–40 g); Wanhua dinner.',
            insiderTip: 'Taxi to the procession-zone edge, then walk in; paid today: food, transit, E7PLAY.'
          },
          {
            id: 'day-04',
            dayNum: '04',
            shortLabel: 'Qixing / 七星',
            city: 'Taipei / 台北',
            dateString: 'Tue, Dec 01, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Chrysanthemums → Qixing from Lengshuikeng → Thermal Valley → Tamsui → Shilin → E7PLAY',
            titleTc: '士林菊展・冷水坑登七星山・地熱谷・淡水・士林夜市・E7PLAY',
            hotelRef: 'taipei',
            transitSummary: 'Taxi to Lengshuikeng + pre-arranged pickup + MRT Red Line + taxi to Sanchong and back.',
            weatherExpected: '~66°F in the city • the Qixing summit is exposed, windy and colder; layer up',
            rainBackupAvailable: true,
            easyPlan: 'Legs or weather say no: skip the mountain; longer Beitou (Thermal Valley, library) and Tamsui.',
            rainPlan: 'Qixing bad: chrysanthemum show, Thermal Valley, library, Tamsui, 60 min Shilin, longer E7PLAY; no museums.',
            leaveByTime: '8:15 AM from hotel',
            timeline: [
              {
                time: '8:40 AM – 9:15 AM',
                title: 'Shilin Residence Chrysanthemum Show',
                titleTc: '士林官邸菊展',
                icon: 'flower',
                notes: '士林官邸菊展, Nov 27 – Dec 13; free, 8:00 AM – 7:00 PM. Best display area only, then leave.',
                navigateTo: '台北市士林區福林路60號',
                addressTc: '台北市士林區福林路60號',
                guide: {
                  steps: [
                    {
                      label: 'Get there',
                      detail: 'Leave 8:15 AM: Red Line to Shilin, Exit 2, ~10 min to 福林路60號. Late: taxi.'
                    },
                    {
                      label: 'See',
                      detail: 'Standing (大立菊), cascade (懸崖菊), topiary (造型菊) displays; Lai Wen-bin plant wall.'
                    },
                    {
                      label: 'Skip',
                      detail: 'Ticketed Main Residence and indoor halls.'
                    },
                    {
                      label: 'Leave by',
                      detail: '9:15 AM. Check Lengshuikeng live camera for fog; buy summit snacks.'
                    }
                  ]
                }
              },
              {
                time: '9:15 AM – 9:55 AM',
                title: 'Taxi to Lengshuikeng',
                titleTc: '計程車前往冷水坑',
                icon: 'car',
                notes: '冷水坑遊客服務站, 菁山路101巷170號; 9:00 AM – 4:30 PM, closed last Monday monthly (open today).',
                navigateTo: '冷水坑遊客服務站',
                addressTc: '台北市士林區菁山路101巷170號',
                guide: {
                  steps: [
                    {
                      label: 'Hail',
                      detail: 'Fulin Rd or Zhongshan N. Rd. NT$85 first 1.25 km, then NT$5 per 200 m.'
                    },
                    {
                      label: 'Confirm pickup',
                      detail: 'Message the driver to confirm the 1:15 PM return pickup.'
                    },
                    {
                      label: 'On arrival',
                      detail: 'Toilets and water at the visitor centre. Milk Lake only if ahead of 1:15 PM.'
                    },
                    {
                      label: 'Fallback',
                      detail: 'No taxi: bus 小15 from MRT Jiantan via Lengshuikeng; not the 108.'
                    }
                  ]
                }
              },
              {
                time: '~10:00 AM – 1:15 PM',
                title: 'Qixing Mountain: Lengshuikeng → East Peak → Main Peak → Lengshuikeng',
                titleTc: '七星山：冷水坑 → 東峰 → 主峰 → 冷水坑',
                icon: 'mountain',
                notes: '~4.1 km, 3–3.5 hours, steep stairs. Xiaoyoukeng → Main Peak closed Oct 27, 2026 – Jan 19, 2027.',
                navigateTo: '冷水坑遊客服務站',
                addressTc: '台北市士林區菁山路101巷170號',
                guide: {
                  intro: 'Out and back from Lengshuikeng while the Xiaoyoukeng side is closed.',
                  steps: [
                    {
                      label: 'Bring',
                      detail: '1 L+ water each, windproof layer, rain shell, grippy shoes, snacks; lunch 2:30 PM.'
                    },
                    {
                      label: 'Up',
                      detail: 'Steps to East Peak, then ~15 min saddle to Main Peak; junctions signposted.'
                    },
                    {
                      label: 'Turnaround',
                      detail: 'Not at Main Peak by ~11:45 AM: turn back.'
                    },
                    {
                      label: 'Back',
                      detail: 'Retrace via East Peak; never descend toward Xiaoyoukeng (closed).'
                    }
                  ],
                  exit: 'Back by ~1:15 PM pickup; cancel summit in fog or high wind.'
                },
                live: {
                  label: 'Trail closure notice',
                  url: 'https://www.ymsnp.gov.tw/ch/titlelist/news/4623'
                }
              },
              {
                time: '~1:15 PM – 1:55 PM',
                title: 'Pre-Arranged Pickup at Lengshuikeng → Beitou',
                titleTc: '冷水坑預約接送 → 北投',
                icon: 'car',
                notes: 'Arrange before the day; don\'t rely on a random mountain taxi. ~35–40 min to Thermal Valley.',
                navigateTo: '冷水坑遊客服務站',
                addressTc: '台北市士林區菁山路101巷170號',
                guide: {
                  steps: [
                    {
                      label: 'Book ahead',
                      detail: 'Give driver 冷水坑遊客服務站, 台北市北投區中山路 地熱谷, 1:15 PM.'
                    },
                    {
                      label: 'Meet',
                      detail: 'Visitor-centre car park; message the driver once off the trail.'
                    },
                    {
                      label: 'Fallback',
                      detail: 'Bus 108 to Yangmingshan, bus 230 to MRT Beitou; skip Thermal Valley, straight to Tamsui.'
                    }
                  ]
                }
              },
              {
                time: '2:00 PM – 2:25 PM',
                title: 'Beitou Thermal Valley (20–25 min)',
                titleTc: '北投地熱谷',
                icon: 'droplets',
                notes: 'Viewing path only, no bathing. Free; Tue–Sun 9:00 AM – 5:00 PM, closed Mondays; works can close it.',
                navigateTo: '北投地熱谷',
                addressTc: '台北市北投區中山路 地熱谷',
                guide: {
                  steps: [
                    {
                      label: 'Walk in',
                      detail: 'From the 中山路 drop, follow the path up.'
                    },
                    {
                      label: 'Leave by',
                      detail: '2:25 PM; walk down to lunch near Xinbeitou MRT.'
                    },
                    {
                      label: 'Running late',
                      detail: 'Hike ran late: skip Beitou entirely.'
                    }
                  ]
                }
              },
              {
                time: '2:30 PM – 3:05 PM',
                title: 'Late Lunch near Xinbeitou',
                titleTc: '新北投・遲午餐',
                icon: 'utensils',
                notes: 'Protein-forward bowl near Xinbeitou MRT.',
                navigateTo: '新北投捷運站',
                addressTc: '台北市北投區大業路700號（新北投捷運站）',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Beef noodle soup extra beef, or pork-chop or chicken-leg rice, braised egg (35–40 g).'
                    },
                    {
                      label: 'Leave by',
                      detail: '3:05 PM: taxi from the MRT forecourt to Tamsui, ~30–40 min.'
                    }
                  ]
                }
              },
              {
                time: '3:05 PM – 3:45 PM',
                title: 'Taxi to Tamsui',
                titleTc: '計程車／捷運往淡水',
                icon: 'train',
                notes: 'Taxi beats two MRT changes for three: ~30–40 min.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'Ask for 淡水老街 (Zhongzheng Road); split the meter three ways.'
                    },
                    {
                      label: 'Arrive',
                      detail: 'Get out at the Old Street end.'
                    }
                  ]
                }
              },
              {
                time: '3:50 PM – 5:20 PM',
                title: 'Tamsui — Old Street, Riverfront & Sunset',
                titleTc: '淡水・河岸・夕陽・老街・晚餐',
                icon: 'sunset',
                notes: 'Sunset just after 5:00 PM. One or two snacks; no Bali, no shop browsing.',
                navigateTo: '新北市淡水區中正路',
                addressTc: '新北市淡水區中正路',
                guide: {
                  steps: [
                    {
                      label: 'A-gei first',
                      detail: '3:50 PM, 三姐妹阿給 (真理街2巷1號; Tue 6:00 AM – 5:00 PM): 阿給 + 魚丸湯.'
                    },
                    {
                      label: 'Old Street',
                      detail: '4:15–4:30 PM: Zhongzheng Road down to the river.'
                    },
                    {
                      label: 'Sunset',
                      detail: 'From 4:30 PM west along the promenade; settle by ~4:50 PM.'
                    },
                    {
                      label: 'Leave by',
                      detail: '5:20 PM for dinner nearby.'
                    }
                  ]
                }
              },
              {
                time: '5:20 PM – 6:05 PM',
                title: 'Tamsui Dinner — Hei Dian Pork-Chop Rice',
                titleTc: '淡水晚餐・黑殿飯店',
                icon: 'utensils',
                notes: '黑殿飯店 (中正路11之10號; Tue 11:00 AM – 8:30 PM). Minimum spend and table time limit: order and eat steadily.',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Each: 排骨飯 (pork chop rice) or braised rib rice + 滷蛋; share tofu or greens.'
                    },
                    {
                      label: 'Backup',
                      detail: 'Full: any Zhongzheng Road rice shop, pork chop or chicken leg rice.'
                    },
                    {
                      label: 'Leave by',
                      detail: '6:05 PM, to MRT Tamsui.'
                    }
                  ]
                },
                navigateTo: '黑殿飯店 淡水 中正路11之10號',
                addressTc: '新北市淡水區中正路11之10號'
              },
              {
                time: '6:05 PM – ~7:00 PM',
                title: 'Red Line South to Jiantan',
                titleTc: '淡水信義線南下劍潭',
                icon: 'train',
                notes: 'Every train from Tamsui stops at Jiantan; weekday trains every ~6 min until 7:30 PM.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Board',
                      detail: 'EasyCard; first train starts here, for seats.'
                    },
                    {
                      label: 'Get off',
                      detail: 'Jiantan (劍潭), the stop after Shilin.'
                    },
                    {
                      label: 'Exit 1',
                      detail: '~400 m north to Shilin Market (基河路101號).'
                    }
                  ]
                }
              },
              {
                time: '7:00 PM – 8:00 PM',
                title: 'Shilin Night Market — Games & Food',
                titleTc: '士林夜市・遊戲與小吃',
                icon: 'store',
                notes: '5:00 PM – midnight; 60 min max. No clothes or souvenirs. Mostly cash: NT$100 notes and coins. Rain: B1 food court (基河路101號).',
                navigateTo: '士林夜市',
                addressTc: '台北市士林區大南路84號（士林慈諴宮，夜市中段）',
                guide: {
                  steps: [
                    {
                      label: 'Games',
                      detail: 'Around Yangming Theater: balloon darts, ring toss; two or three, ~20 min.'
                    },
                    {
                      label: 'Eat',
                      detail: 'One item if excellent: 大雞排 (big fried chicken cutlet).'
                    },
                    {
                      label: 'Leave by',
                      detail: '8:00 PM: taxi from Wenlin Rd or Jihe Rd.'
                    }
                  ]
                }
              },
              {
                time: '8:00 PM – 8:20 PM',
                title: 'Taxi to E7PLAY Sanchong',
                titleTc: '計程車往 E7PLAY 三重',
                icon: 'car',
                notes: '~20 min. Day meter: NT$85 first 1.25 km, then NT$5 per 200 m.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Hail',
                      detail: 'Wenlin Rd or Jihe Rd at the market edge, not inside the lanes.'
                    },
                    {
                      label: 'Destination',
                      detail: '新北市三重區中央南路63號, by MRT Taipei Bridge; lane at the Shin Kong Bank corner.'
                    }
                  ]
                }
              },
              {
                time: '8:30 PM – 11:00 PM',
                title: 'E7PLAY Sanchong — Bowling, Billiards, Darts',
                titleTc: 'E7PLAY 三重店・保齡球・撞球・飛鏢',
                icon: 'gamepad-2',
                notes: 'B1–B3, 中央南路63號; open 24 hours. One ticket covers bowling, pool, darts, KTV, board games, arcade.',
                navigateTo: 'E7PLAY 三重店 中央南路63號',
                addressTc: '新北市三重區中央南路63號',
                guide: {
                  steps: [
                    {
                      label: 'Tickets',
                      detail: 'Weekday 3 h NT$290 + 10% cleaning; overtime NT$30/30 min. Visa/Mastercard/JCB, LINE Pay, TWQR.'
                    },
                    {
                      label: 'Bowling',
                      detail: '30-minute lanes, 15-minute extensions; all full: rebook at the counter.'
                    },
                    {
                      label: 'Bring ID',
                      detail: 'Darts, KTV, massage rooms need passport plus ticket.'
                    },
                    {
                      label: 'Leave by',
                      detail: '11:00 PM; taxi to the hotel.'
                    }
                  ]
                }
              },
              {
                time: '~11:15 PM – 11:30 PM',
                title: 'Back to Via Hotel',
                titleTc: '返回丰居旅店',
                icon: 'building-2',
                notes: 'Taxi to Via Hotel (台北市中正區重慶南路一段60號). From 11:00 PM: NT$20 night surcharge, flag fall NT$105.',
                navigateTo: '台北市中正區重慶南路一段60號',
                addressTc: '台北市中正區重慶南路一段60號',
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'Hail on 中央南路 outside E7PLAY; show the address in Chinese.'
                    },
                    {
                      label: 'Before bed',
                      detail: '25 g whey scoop; hang hiking layers to dry. Driver pickup 8:30 AM.'
                    }
                  ]
                }
              }
            ],
            backups: {
              activity: {
                title: 'Weather fallback: longer Beitou',
                titleTc: '天氣備案：延長北投',
                note: 'Skip the mountain; walk Beitou (Thermal Valley, the library) and give Tamsui a longer afternoon.',
                navigateTo: '台北市北投區中山路30-10號'
              },
              foods: [
                {
                  title: 'Ootoya Xinbeitou',
                  titleTc: '大戶屋 新北投店',
                  note: 'Set-meal backup near Xinbeitou if Wu Beef Noodles is closed.',
                  navigateTo: 'Ootoya Xinbeitou, Taipei'
                }
              ]
            },
            foodRecommendation: 'Breakfast before 8:15 AM → summit snacks → late lunch near Xinbeitou → Tamsui dinner → Shilin bites.',
            proteinHeadline: '50 g whey · food ~100 g',
            proteinPlan: '25 g before Qixing + 25 g tonight; Xinbeitou lunch 35–40 g, Tamsui dinner 40 g+; soy milk backup.',
            insiderTip: 'Fixed point: ~1:15 PM Lengshuikeng pickup. No hot spring or foot soak; Xiaoyoukeng trail closed. Paid: taxis, E7PLAY.'
          },
          {
            id: 'day-05',
            dayNum: '05',
            shortLabel: 'Jiufen / 九份',
            city: 'Taipei Day Trip / 台北近郊',
            dateString: 'Wed, Dec 02, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Private Driver → Shifen → Teapot Mountain → Jiufen → NARA Massage → East District',
            titleTc: '包車・十分瀑布・茶壺山・九份・NARA泰式按摩',
            hotelRef: 'taipei',
            transitSummary: 'Private driver ~10 hours (8:30 AM – 6:30 PM)',
            weatherExpected: '~64°F • Mountain mist; rain possible',
            rainBackupAvailable: true,
            easyPlan: 'Tired: drop Golden Waterfall and Yin-Yang Sea first; Jiufen ~1 hour.',
            rainPlan: 'Teapot unsafe: lower Jinguashi viewpoints, short mining-town walk, Jiufen ~75–90 min, earlier return; NARA fixed.',
            leaveByTime: '8:30 AM driver pickup',
            timeline: [
              {
                time: '8:30 AM – 9:30 AM',
                title: 'Private Driver Pickup at Via Hotel → Shifen',
                titleTc: '包車飯店出發 → 十分',
                icon: 'car',
                notes: 'Driver ~10 hours (8:30 AM – 6:30 PM). Overtime: Tripool NT$500 per extra 30 min, cash to driver; don\'t cut Jiufen.',
                navigateTo: '台北市中正區重慶南路一段60號',
                addressTc: '台北市中正區重慶南路一段60號',
                guide: {
                  steps: [
                    {
                      label: 'Night before',
                      detail: 'Send driver: Shifen 新北市平溪區乾坑10號 → 勸濟堂 car park → 基山街 → NARA 台北市大安區仁愛路四段345巷4弄19號.'
                    },
                    {
                      label: 'Before pickup',
                      detail: '25 g whey; 500 ml water each (none on Teapot trail); hiking shoes; soy milk.'
                    },
                    {
                      label: 'Pickup',
                      detail: 'Via Hotel entrance, 重慶南路一段60號. Hotel tel +886-2-2314-2121.'
                    },
                    {
                      label: 'At Shifen',
                      detail: 'Park by visitor centre; fallback 城市車旅平溪停三, NT$35 first hour. Gate opens 9:00 AM.'
                    }
                  ]
                }
              },
              {
                time: '~9:30 AM – 10:20 AM',
                title: 'Shifen Waterfall Trails & Viewpoints',
                titleTc: '十分瀑布・步道與觀景台',
                icon: 'camera',
                notes: 'Free; December 9:00 AM – 5:00 PM, last entry 4:30 PM.',
                navigateTo: '新北市平溪區乾坑10號',
                addressTc: '新北市平溪區乾坑10號',
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Visitor centre → Sihguangtan Bridge (四廣潭橋) → upper platforms → lower platform.'
                    },
                    {
                      label: 'Leave by',
                      detail: 'Head back 10:10 AM. No lanterns, Old Street or rail-line extras.'
                    }
                  ]
                }
              },
              {
                time: '10:20 AM – 11:10 AM',
                title: 'Drive to Jinguashi',
                titleTc: '車程前往金瓜石',
                icon: 'car',
                notes: '~50 min. Museum parking limited: park at Quanji Temple (勸濟堂), ~10-min walk, Teapot trailhead side.',
                navigateTo: '新北市瑞芳區金光路8號',
                addressTc: '新北市瑞芳區金光路8號',
                guide: {
                  steps: [
                    {
                      label: 'Tell driver',
                      detail: 'Drop at Gold Museum (新北市瑞芳區金光路8號; Maps: 黃金博物館遊客服務中心); wait at 勸濟堂 car park.'
                    },
                    {
                      label: 'Car sickness',
                      detail: 'Prone? Sit in front, look ahead on final curves.'
                    },
                    {
                      label: 'Water',
                      detail: 'Confirm 500 ml each before arrival; none on trail.'
                    }
                  ]
                }
              },
              {
                time: '11:10 AM – 11:50 AM',
                title: 'Lunch in Jinguashi — Eat Before the Hike',
                titleTc: '金瓜石午餐・登山前先吃',
                icon: 'utensils',
                notes: 'Miners\' Cafe (礦工食堂), 金光路8-1號, tel 02-2496-2898; weekdays 9:00 AM – 5:00 PM. Skip the museum (NT$80).',
                navigateTo: '新北市瑞芳區金光路8號',
                addressTc: '新北市瑞芳區金光路8號',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Miners\' lunch box (礦工便當) each + car soy milk. Optional sweet-potato soft serve.'
                    },
                    {
                      label: 'Eat',
                      detail: 'At the cafe; no food, drink or gum in museum buildings.'
                    },
                    {
                      label: 'Leave by',
                      detail: '11:50 AM; ~10-min walk to 勸濟堂 for 12:00 PM start.'
                    }
                  ]
                }
              },
              {
                time: '12:00 PM – 1:45 PM',
                title: 'Teapot Mountain / Jinguashi Mining Landscape',
                titleTc: '無耳茶壺山・金瓜石礦山地景',
                icon: 'mountain',
                notes: 'Quanji Temple → ridge → pavilion → Teapot rock → back; free, 24 hours. 1.5–2 hours round trip; window is tight.',
                navigateTo: '無耳茶壺山登山口',
                addressTc: '新北市瑞芳區金瓜石祈堂路53號（勸濟堂旁登山口）',
                guide: {
                  intro: 'About 1.5–2 hours from Quanji Temple and back.',
                  steps: [
                    {
                      label: 'Climb',
                      detail: 'Trailhead beside 勸濟堂; 40–60 min up. Carry 500 ml each; none on trail.'
                    },
                    {
                      label: 'Turnaround',
                      detail: 'Start down by 1:05 PM wherever you are; 30–40 min descent.'
                    },
                    {
                      label: 'Running long',
                      detail: 'Drop Golden Waterfall.'
                    },
                    {
                      label: 'Rock section',
                      detail: 'Hands-and-feet scramble; only if dry and calm.'
                    }
                  ],
                  exit: 'Slick/windy: stop below rock. Fog: lower viewpoint. No Banpingshan.'
                }
              },
              {
                time: '~1:55 PM – 2:30 PM',
                title: 'Golden Waterfall & Yin-Yang Sea (Photo Stops, If on Route)',
                titleTc: '黃金瀑布・陰陽海（順路拍照）',
                icon: 'camera',
                notes: 'Free drive-up stops on North 34 (北34), off the direct route; drop first. Yin-Yang Sea only if traffic and parking easy.',
                navigateTo: '黃金瀑布 瑞芳',
                addressTc: '新北市瑞芳區金水公路 黃金瀑布',
                guide: {
                  steps: [
                    {
                      label: 'Decide',
                      detail: 'Back at car after 1:50 PM? Skip both; straight to Jiufen.'
                    },
                    {
                      label: 'Golden Waterfall',
                      detail: 'Stop by 金水公路; 10 min.'
                    },
                    {
                      label: 'Yin-Yang Sea',
                      detail: 'Park at Shuinandong car park; 10 min.'
                    }
                  ]
                }
              },
              {
                time: '~3:00 PM – 4:00 PM',
                title: 'Jiufen — Hillside Lanes, Food, Views, Dusk',
                titleTc: '九份・山城巷弄・小吃・黃昏',
                icon: 'footprints',
                notes: 'Old Street (基山街), one snack, one dessert, lantern lanes, one high view. Stalls close 7:00 PM; sunset 5:03 PM.',
                navigateTo: '新北市瑞芳區基山街',
                addressTc: '新北市瑞芳區基山街',
                guide: {
                  steps: [
                    {
                      label: 'Drop-off',
                      detail: '基山街 entrance; agree a 4:00 PM pickup point first.'
                    },
                    {
                      label: 'Eat',
                      detail: 'Pork meatball (肉圓) or herb rice cake (草仔粿); taro balls (芋圓) at a counter.'
                    },
                    {
                      label: 'Lantern lanes',
                      detail: 'Down 豎崎路 stairway for the high view; then 昇平戲院 (Shengping Theater).'
                    },
                    {
                      label: 'Skip',
                      detail: 'No teahouse queue, no 90-minute sit, no side alleys.'
                    }
                  ]
                }
              },
              {
                time: '4:00 PM – 5:30 PM',
                title: 'Private Driver Back to Taipei',
                titleTc: '包車返回台北',
                icon: 'car',
                notes: 'Default drop near NARA, not the hotel. NARA: 6-min walk from MRT Zhongxiao Dunhua; slot held 10 min.',
                navigateTo: '台北市中正區重慶南路一段60號',
                addressTc: '台北市中正區重慶南路一段60號',
                guide: {
                  steps: [
                    {
                      label: 'Drop-off',
                      detail: '仁愛路四段345巷4弄19號 area; via hotel (重慶南路一段60號) only if traffic light.'
                    },
                    {
                      label: 'In car',
                      detail: 'Drink the soy milk.'
                    },
                    {
                      label: 'Pay',
                      detail: 'Settle up; past 10 hours, NT$500 per extra 30 min, cash.'
                    }
                  ]
                }
              },
              {
                time: '5:45 PM – 6:40 PM',
                title: 'Dinner — Zhong Nan Restaurant (忠南飯館)',
                titleTc: '忠南飯館・家常台菜',
                icon: 'utensils',
                notes: '忠南飯館, 仁愛路三段88號, tel 02-2706-1256; no reservations, queue. Aim 40 g+ protein each; ~20-min walk or taxi from NARA.',
                guide: {
                  steps: [
                    {
                      label: 'Call first',
                      detail: 'Phone in the afternoon; Wednesday dinner hours unconfirmed.'
                    },
                    {
                      label: 'Order',
                      detail: 'Pickled-veg beef (酸菜牛肉), tofu or duck blood, 紅燒肉 or 京醬肉絲, vegetable, rice each.'
                    },
                    {
                      label: 'Backup',
                      detail: 'Closed or long queue: braised beef noodles, extra beef, near Zhongxiao Dunhua.'
                    },
                    {
                      label: 'Go easy',
                      detail: 'Eat moderately before the two-hour massage.'
                    }
                  ]
                },
                navigateTo: '忠南飯館 仁愛路三段88號',
                addressTc: '台北市大安區仁愛路三段88號'
              },
              {
                time: '6:40 PM – 7:45 PM',
                title: 'East District / Da\'an Walk & Coffee',
                titleTc: '東區・大安散步・咖啡',
                icon: 'footprints',
                notes: 'One walk, one coffee; dessert after the massage.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Walk',
                      detail: 'East on Zhongxiao East Road Section 4 to Sun Yat-sen Memorial Hall.'
                    },
                    {
                      label: 'Coffee',
                      detail: 'One coffee or tea in lanes off Zhongxiao East Road; no cake.'
                    },
                    {
                      label: 'At NARA',
                      detail: '仁愛路四段345巷4弄19號 by 8:20 PM; 10 min from Sun Yat-sen Memorial Hall.'
                    }
                  ]
                }
              },
              {
                time: '8:30 PM – 10:30 PM',
                title: 'NARA Thai Massage: 120-min Traditional Bodywork',
                titleTc: 'NARA 泰式養生館・120分鐘傳統泰式',
                icon: 'sparkles',
                notes: 'From NT$1,299 on FunNow; beside 東區粉圓, near Zhongxiao Dunhua; tel 02-2771-6692. Includes foot bath, tea, Thai dessert.',
                navigateTo: '台北市大安區仁愛路四段345巷4弄19號',
                addressTc: '台北市大安區仁愛路四段345巷4弄19號',
                guide: {
                  steps: [
                    {
                      label: 'Book',
                      detail: 'Three 8:30 PM slots on FunNow (泰式古法舒壓按摩 120 min); no therapist or gender choice.'
                    },
                    {
                      label: 'Arrive',
                      detail: 'By 8:20 PM; slot held 10 min, then cancellable, no refund.'
                    },
                    {
                      label: 'Tell them',
                      detail: 'Flag injuries; ask for extra calf and thigh work; say if too hard.'
                    }
                  ]
                }
              },
              {
                time: '10:30 PM – 11:30 PM',
                title: 'East District Late Food & Dessert',
                titleTc: '東區宵夜・甜點',
                icon: 'utensils',
                notes: 'Eastern Ice Store (東區粉圓), 忠孝東路四段216巷38號, next to NARA; until 11:00 PM. Flat price per bowl, up to four toppings (NT$70).',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Go straight',
                      detail: 'Walk over at 10:30 PM.'
                    },
                    {
                      label: 'Order',
                      detail: 'Point at trays: tofu pudding (豆花), peanuts, red bean, taro balls; skip extra syrup.'
                    },
                    {
                      label: 'Still hungry',
                      detail: 'Tea eggs (茶葉蛋), chicken breast at 7-Eleven/FamilyMart on Zhongxiao East Road; whey at hotel.'
                    }
                  ]
                }
              },
              {
                time: '~11:35 PM – 11:45 PM',
                title: 'Back to Via Hotel',
                titleTc: '返回丰居旅店',
                icon: 'building-2',
                notes: 'Taxi to Via Hotel, 台北市中正區重慶南路一段60號 (tel +886-2-2314-2121).',
                navigateTo: '台北市中正區重慶南路一段60號',
                addressTc: '台北市中正區重慶南路一段60號',
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'Hail on Zhongxiao East or Dunhua South Road; three fit one car.'
                    },
                    {
                      label: 'MRT fallback',
                      detail: 'Blue Line Zhongxiao Dunhua → Taipei Main; last train: Go! Taipei Metro app.'
                    },
                    {
                      label: 'Tonight',
                      detail: '25 g whey; leave 9:00 AM tomorrow.'
                    }
                  ]
                }
              }
            ],
            backups: {
              activity: {
                title: 'Gold Museum area instead of the climb',
                titleTc: '黃金博物館園區（取代登山）',
                note: 'For slick rocks or strong wind: the Gold Museum park, then on to Jiufen.',
                navigateTo: '新北市瑞芳區金光路8號'
              }
            },
            foodRecommendation: 'Jinguashi lunch before the hike → Jiufen snacks → Taipei dinner before NARA',
            proteinHeadline: '50 g whey · food ~100 g',
            proteinPlan: '25 g whey before pickup + after NARA; Jinguashi lunch before hike, dinner 40 g+, soy milk in car.',
            insiderTip: 'Paid: driver ~US$45–65 each, NARA ~US$40. Tripool overtime NT$500 per 30 min, cash. No Shifen lanterns.'
          },
          {
            id: 'day-06',
            dayNum: '06',
            shortLabel: '101 / 象山',
            city: 'Taipei / 台北',
            dateString: 'Thu, Dec 03, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Archery → CKS → Air Rifle → Taipei 101 → Elephant Mountain → Raohe → Christmas',
            titleTc: '射箭・中正紀念堂・空氣步槍・台北101・象山・饒河夜市・聖誕',
            hotelRef: 'taipei',
            transitSummary: 'MRT Red Line + short walks (Zhongzheng → 101 → Xiangshan → Daan)',
            weatherExpected: '~70°F • Mild seasonal conditions',
            rainBackupAvailable: true,
            easyPlan: 'Tired: keep archery, air rifle, Taipei 101; drop CKS first, then Elephant Mountain.',
            rainPlan: 'Rain: keep archery, rifle, Taipei 101; drop Elephant Mountain; Christmas if manageable. Severe: E7PLAY Sanchong evening.',
            leaveByTime: '9:00 AM from hotel',
            timeline: [
              {
                time: '9:30 AM – 10:30 AM',
                title: 'Zhongzheng Sports Center — Archery',
                titleTc: '臺北市中正運動中心・射箭',
                icon: 'target',
                notes: '9F range, open 9:00 AM – 10:00 PM. NT$300 first hour with bow, gear, basic instruction; 10–15 min safety briefing.',
                navigateTo: '台北市中正區信義路一段1號',
                addressTc: '台北市中正區信義路一段1號',
                guide: {
                  intro: 'Local-price sport in the CKS corridor.',
                  steps: [
                    {
                      label: 'Breakfast',
                      detail: 'Breakfast and 25 g whey by 8:30 AM; no shooting within an hour of eating.'
                    },
                    {
                      label: 'Route',
                      detail: 'Leave 9:00 AM: Red Line two stops to CKS Memorial Hall. 信義路一段1號.'
                    },
                    {
                      label: 'Check in',
                      detail: '9F counter: register, pay, ask for first-hour archery. Tel 02-2396-1000.'
                    }
                  ],
                  recheck: '48–72h before: Thursday hours, walk-in policy, capacity.'
                }
              },
              {
                time: '10:35 AM – 11:05 AM',
                title: 'Liberty Square / Chiang Kai-shek Memorial Hall — Quick Pass',
                titleTc: '自由廣場・中正紀念堂（快速走過）',
                icon: 'landmark',
                notes: 'Gate, square, exterior; no museum. Free; hall 9:00 AM – 6:00 PM. Honour guard drill hourly, ~15 min; cancelled in rain.',
                navigateTo: '台北市中正區中山南路21號',
                addressTc: '台北市中正區中山南路21號',
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Down Zhongshan South Road to Liberty Square arch, then up Democracy Boulevard.'
                    },
                    {
                      label: 'Drill',
                      detail: 'At hall stairs by 10:55 AM for the 11:00 AM drill.'
                    },
                    {
                      label: 'Next',
                      detail: 'To Jin Feng, beside Nanmen Market (MRT Exit 2 side).'
                    }
                  ]
                }
              },
              {
                time: '11:05 AM – 11:35 AM',
                title: 'Light Early Lunch — Jin Feng Braised Pork Rice',
                titleTc: '金峰魯肉飯・輕食早午餐',
                icon: 'utensils',
                notes: 'Light lunch; dinner is the big meal. 羅斯福路一段10號之1, MRT CKS Memorial Hall Exit 2; seats mostly 2F. Thursday open.',
                navigateTo: '台北市中正區羅斯福路一段10號',
                addressTc: '台北市中正區羅斯福路一段10號',
                guide: {
                  intro: 'Lunch timed around the range rule.',
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Small braised pork rice (魯肉飯), egg (滷蛋), fried tofu (油豆腐), vegetable; 肉羹湯 if hungry.'
                    },
                    {
                      label: 'Share',
                      detail: 'One 鼎邊趖 (rice-batter noodle soup). Skip 焢肉 (pork belly).'
                    },
                    {
                      label: 'How',
                      detail: 'Scan table QR, order; pay at the counter leaving.'
                    }
                  ],
                  exit: 'Finish ~11:35 AM; walk and coffee fill the gap to 1:00 PM.'
                }
              },
              {
                time: '11:35 AM – 12:40 PM',
                title: 'Nanmen Market — How Taipei Shops + Coffee',
                titleTc: '南門市場・在地採買＋咖啡',
                icon: 'store',
                notes: '南門市場, 羅斯福路一段8號; 7:00 AM – 7:00 PM, closed Mondays. Look and compare; no eating before the rifle. Old Dongmen Market building closed.',
                navigateTo: '南門市場 羅斯福路一段8號',
                addressTc: '台北市中正區羅斯福路一段8號',
                guide: {
                  steps: [
                    {
                      label: 'B1',
                      detail: 'Butchers, poultry, produce; prices per 斤 (600 g).'
                    },
                    {
                      label: '1F',
                      detail: '南北貨 dry goods, 熟食 counters: cured meats, braised dishes by weight.'
                    },
                    {
                      label: 'Buy',
                      detail: 'Small packs of dried tofu (豆干) or jerky as hike snacks.'
                    },
                    {
                      label: 'Leave by',
                      detail: '12:30 PM; sports centre 1F counter by 12:45 PM.'
                    }
                  ]
                }
              },
              {
                time: '1:00 PM – 2:00 PM',
                title: '10m Air-Rifle Shooting — Zhongzheng Sports Center',
                titleTc: '10公尺空氣步槍射擊・中正運動中心',
                icon: 'crosshair',
                notes: '6F, Tuesday–Friday 1:00–9:00 PM; one hour max. NT$350 (≈ US$11): gun, coaching, target sheet, 30 pellets; confirm on 02-2396-1000.',
                navigateTo: '台北市中正區信義路一段1號',
                addressTc: '台北市中正區信義路一段1號',
                guide: {
                  steps: [
                    {
                      label: '1F counter',
                      detail: '12:45 PM: buy ticket at 1F service counter; no online booking.'
                    },
                    {
                      label: '6F queue',
                      detail: 'Opens 1:00 PM; first come, first served, 10 lanes.'
                    },
                    {
                      label: 'Shoot',
                      detail: 'Coach briefs safety; two-handed hold; 30 pellets, keep the sheet.'
                    },
                    {
                      label: 'Then',
                      detail: 'Red Line to Taipei 101.'
                    }
                  ]
                }
              },
              {
                time: '2:20 PM – 3:10 PM',
                title: 'Taipei 101 Observatory (89F)',
                titleTc: '台北101觀景台（89樓）',
                icon: 'eye',
                notes: '89F + 88F only; no Skyline 460 or 101F. Adult NT$600, concessions need Taiwan ID; 10:00 AM – 9:00 PM; Office Tower 1F counter.',
                navigateTo: '台北市信義區信義路五段7號',
                addressTc: '台北市信義區信義路五段7號',
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Red Line towards Xiangshan, no change, to Taipei 101/World Trade Center.'
                    },
                    {
                      label: 'Tickets',
                      detail: 'Buy full price online beforehand, or at Office Tower 1F.'
                    },
                    {
                      label: 'Inside',
                      detail: '89F loop and damper; skip 101F (NT$380 extra).'
                    },
                    {
                      label: 'Then',
                      detail: 'One Red Line stop to Xiangshan.'
                    }
                  ]
                }
              },
              {
                time: '3:20 PM – 4:40 PM',
                title: 'Elephant Mountain — Golden Hour & Dusk',
                titleTc: '象山步道・黃金時刻與黃昏',
                icon: 'footprints',
                notes: 'Free; skip side trails. Works to April 2027: original trailhead shut 8:00 AM – 5:00 PM, so use Lingyun Temple (靈雲宮).',
                navigateTo: '象山步道 台北市信義區信義路五段150巷22弄',
                addressTc: '台北市信義區信義路五段150巷22弄',
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Xiangshan Exit 2, via Lane 150, to Alley 22 trailhead (~14 min).'
                    },
                    {
                      label: 'Fenced?',
                      detail: 'Enter Lingyun Temple, follow 象山登山步道入口 signs; toilets at temple.'
                    },
                    {
                      label: 'Turn around',
                      detail: 'At Six Giant Rocks, not the peak; head down ~4:15 PM.'
                    },
                    {
                      label: 'Then',
                      detail: 'Taxi for three to Songshan Ciyou Temple (松山慈祐宮), Raohe east gate.'
                    }
                  ]
                }
              },
              {
                time: '5:00 PM – 6:00 PM',
                title: 'Raohe Night Market',
                titleTc: '饒河街觀光夜市',
                icon: 'store',
                notes: 'Dinner. Daily 5:00 PM – midnight; no stall rest days Thursday. No snack queue of 15+ min.',
                navigateTo: '饒河街觀光夜市',
                addressTc: '台北市松山區八德路四段761號（松山慈祐宮，夜市東端）',
                guide: {
                  steps: [
                    {
                      label: 'East gate',
                      detail: 'Shared pepper bun (福州世祖胡椒餅) only if queue under 10 min.'
                    },
                    {
                      label: 'Ribs',
                      detail: '陳董藥燉排骨 (饒河街160號): herbal ribs (藥燉排骨) + braised pork rice (滷肉飯) each.'
                    },
                    {
                      label: 'More meat',
                      detail: 'Share chicken cutlet at 小師傅大雞排 (opposite No. 192); beef noodles/offal soup at No. 63.'
                    },
                    {
                      label: 'Dessert',
                      detail: 'Ma Shu Bao Bao mochi; game stall only with no queue.'
                    }
                  ]
                }
              },
              {
                time: '6:00 PM – 6:20 PM',
                title: 'Rainbow Bridge / Keelung River (Optional)',
                titleTc: '彩虹橋・基隆河（可選）',
                icon: 'footprints',
                notes: 'Optional; open 24 hours, beside Ciyou Temple at the market\'s east end.',
                navigateTo: '彩虹橋 饒河街',
                addressTc: '台北市松山區饒河街底 彩虹橋',
                guide: {
                  steps: [
                    {
                      label: 'Skip if',
                      detail: 'Raohe ran past 6:10 PM; go straight to Daan Park.'
                    },
                    {
                      label: 'Then',
                      detail: 'Taxi to Daan Forest Park (新生南路二段1號); or Green Line to CKS, Red two stops.'
                    }
                  ]
                }
              },
              {
                time: '7:00 PM – 7:45 PM',
                title: 'Taipei Christmas — Opening Night',
                titleTc: '台北聖誕節・開幕夜',
                icon: 'party-popper',
                notes: '2026臺北耶誕愛無限 (Dec 3 – Jan 1): free lights in Daan Forest Park plus concert. Lights 30–45 min; ~1 hour if concert good.',
                navigateTo: '大安森林公園 新生南路二段1號',
                addressTc: '台北市大安區新生南路二段1號',
                guide: {
                  steps: [
                    {
                      label: 'Before',
                      detail: 'Check Taipei Travel event page for concert time a few days ahead.'
                    },
                    {
                      label: 'Arrive',
                      detail: 'Via 新生南路二段1號 or MRT Daan Park (Red Line).'
                    },
                    {
                      label: 'Walk',
                      detail: 'One loop of main installations; a few songs if concert is on.'
                    }
                  ]
                }
              },
              {
                time: '8:00 PM – 9:00 PM',
                title: 'Daan / East Taipei Evening Walk',
                titleTc: '大安・東區夜間散步',
                icon: 'footprints',
                notes: 'Walk north-east via Ren\'ai Road to Zhongxiao Dunhua for dessert.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Exit at Xinyi Road / Jianguo South Road corner; north to Ren\'ai Road.'
                    },
                    {
                      label: 'Ren\'ai Road',
                      detail: 'East to Dunhua South Road, north to Zhongxiao East Road.'
                    },
                    {
                      label: 'Tired?',
                      detail: 'Taxi from the park to Zhongxiao Dunhua.'
                    }
                  ]
                }
              },
              {
                time: '9:00 PM – 10:00 PM',
                title: 'Dessert / Games / Café',
                titleTc: '甜點・遊戲・咖啡',
                icon: 'coffee',
                notes: 'Zhongxiao Dunhua lanes: one dessert, one game, one café. No new night market.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Dessert',
                      detail: 'Tofu pudding (豆花) with peanuts or red bean; or shaved ice (剉冰).'
                    },
                    {
                      label: 'Games',
                      detail: 'Claw machines (夾娃娃機店) off Zhongxiao East Road Section 4; set a cash limit.'
                    },
                    {
                      label: 'Café',
                      detail: 'Tea or decaf in lanes off Dunhua South Road.'
                    }
                  ]
                }
              },
              {
                time: '~10:45 PM – 11:15 PM',
                title: 'Back to Via Hotel',
                titleTc: '返回丰居旅店',
                icon: 'building-2',
                notes: 'MRT or taxi to Via Hotel, 台北市中正區重慶南路一段60號.',
                navigateTo: '台北市中正區重慶南路一段60號',
                addressTc: '台北市中正區重慶南路一段60號',
                guide: {
                  steps: [
                    {
                      label: 'MRT',
                      detail: 'Blue Line Zhongxiao Dunhua → Taipei Main, no change; EasyCard or 101 combo card.'
                    },
                    {
                      label: 'Taxi',
                      detail: 'Simpler for three: Zhongxiao East Road → 重慶南路一段60號.'
                    },
                    {
                      label: 'Last train',
                      detail: 'Late? Check Go! Taipei Metro app before going underground.'
                    },
                    {
                      label: 'Tonight',
                      detail: 'Pack: checkout 8:05 AM for THSR south.'
                    }
                  ]
                }
              }
            ],
            backups: {
              activity: {
                title: 'E7PLAY Sanchong (severe rain)',
                titleTc: 'E7PLAY 三重店',
                note: 'Open 24 hours: bowling, pool, darts and arcade games at 新北市三重區中央南路63號 (nearest MRT Taipei Bridge). Taxi there, play until ~11:30 PM, taxi back.',
                navigateTo: 'E7PLAY 三重店 中央南路63號'
              }
            },
            foodRecommendation: 'Jin Feng 金峰魯肉飯 (light, early) → Raohe: pepper bun, herbal rib soup, meat, mochi → Daan dessert',
            proteinHeadline: '25 g whey · food ~125 g',
            proteinPlan: '25 g whey at breakfast; light lunch before the range; Raohe meat dishes and rib soup as dinner.',
            insiderTip: 'Archery first, light early lunch, rifle 1:00 PM. Paid: archery ~US$9, rifle ~US$11, Taipei 101 ~US$18.'
          },
          {
            id: 'day-07',
            dayNum: '07',
            shortLabel: 'KHH / 高雄',
            city: 'Kaohsiung / 高雄',
            dateString: 'Fri, Dec 04, 2026',
            timeZone: 'Asia/Taipei',
            title: 'THSR South → Bouldering → Pier-2 → Karting → E7PLAY',
            titleTc: '高鐵南下・抱石攀岩・駁二・卡丁車・E7PLAY',
            hotelRef: 'kaohsiung',
            transitSummary: 'THSR + luggage storage at Zuoying + MRT / short taxis',
            weatherExpected: '~77°F • Warm south; bouldering is indoors',
            rainBackupAvailable: true,
            easyPlan: 'Tired after the train: bouldering ~75–90 min, brisk Pier-2, shorter harbour walk.',
            rainPlan: 'No kart: longer Pier-2 / harbour dinner, E7PLAY earlier. E7PLAY packed: Liuhe and harbour walk.',
            leaveByTime: '8:05 AM checkout',
            timeline: [
              {
                time: '8:05 AM – 8:40 AM',
                title: 'Checkout → Taipei Main → THSR Boarding',
                titleTc: '退房 → 台北車站 → 高鐵上車',
                icon: 'luggage',
                notes: 'Walk to THSR Taipei (underground, linked to TRA concourse). Train 0615 at 8:46 AM; fallback 1307 at 9:01 AM or 0207 at 8:31 AM.',
                navigateTo: 'Taipei Main Station (HSR Gates), Zhongzheng District, Taipei',
                guide: {
                  steps: [
                    {
                      label: 'Before checkout',
                      detail: 'Breakfast, 25 g whey; buy water before the gates (none on board).'
                    },
                    {
                      label: 'Route',
                      detail: 'Follow THSR signs through B1 corridors.'
                    },
                    {
                      label: 'Tickets',
                      detail: 'Collect by 8:35 AM; valid only for printed date and train.'
                    },
                    {
                      label: 'Luggage',
                      detail: 'Max 150 cm long, 220 cm total per bag; large cases at car end.'
                    }
                  ]
                }
              },
              {
                time: '~8:46 AM – 10:45 AM',
                title: 'THSR: Taipei → Zuoying',
                titleTc: '台灣高鐵：台北 → 左營',
                icon: 'train',
                notes: 'Dec 4: 0615 8:46 AM → 10:45 AM; 1307 9:01 AM → 11:00 AM. Standard reserved NT$1,490 each; your ticket is authoritative.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Board',
                      detail: 'Car and seat on ticket; non-reserved cars 10–12 (9–12 on 0615).'
                    },
                    {
                      label: 'Seats',
                      detail: 'Swivel a row 180° to face each other.'
                    },
                    {
                      label: 'On board',
                      detail: 'Toilets: odd cars. Cold drinks: cars 1, 5, 11. No strong-smelling food.'
                    },
                    {
                      label: 'Arrive',
                      detail: 'Terminus; take all bags, follow signs to lockers / Baggage Storage.'
                    }
                  ]
                }
              },
              {
                time: '~10:50 AM – 11:00 AM',
                title: 'Store Luggage at New Zuoying',
                titleTc: '新左營寄放行李',
                icon: 'luggage',
                notes: 'Store bags here; the bouldering gym is in the same complex. Locker prices and sizes unpublished; big suitcases may not fit.',
                navigateTo: 'THSR Zuoying Station, Kaohsiung',
                guide: {
                  steps: [
                    {
                      label: 'Lockers',
                      detail: 'Check THSR Zuoying 1F/2F floor map online beforehand.'
                    },
                    {
                      label: 'Big bags',
                      detail: 'Don\'t fit? Use Baggage Storage.'
                    },
                    {
                      label: 'Then',
                      detail: 'Taxi to Fenyang Wonton, 高雄市左營區左營大路84號.'
                    }
                  ]
                }
              },
              {
                time: '11:00 AM – 11:35 AM',
                title: 'Lunch at Zuoying — Fenyang Wonton (Founding Shop)',
                titleTc: '左營午餐・老左營汾陽餛飩 創始老店',
                icon: 'utensils',
                notes: 'In old Zuoying, outside the station complex; taxi each way. Hours unpublished: phone 07-588-7000 to confirm Friday lunch.',
                navigateTo: '高雄市左營區左營大路84號',
                addressTc: '高雄市左營區左營大路84號',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Wonton soup each + shared 祖傳鹹湯圓 (savoury pork-and-shiitake tangyuan); extra shared wontons.'
                    },
                    {
                      label: 'If closed',
                      detail: 'Din Tai Fung (鼎泰豐, 博愛二路777號B1): pork xiaolongbao, pork chop fried rice.'
                    },
                    {
                      label: 'Leave by',
                      detail: 'Taxi back to Global Mall (站前北路1號) by 11:45 AM.'
                    }
                  ]
                }
              },
              {
                time: '11:45 AM – 1:45 PM',
                title: 'Boulder Space Zuoying — Indoor Bouldering',
                titleTc: 'Boulder Space 圓石空間・左營店',
                icon: 'dumbbell',
                notes: 'Global Mall 3F, New Zuoying Station: NT$350 entry + NT$80 shoes. Mall 3F Fridays 11:00 AM – 10:00 PM; reconfirm Dec 4.',
                navigateTo: 'Boulder Space 圓石空間攀岩館 左營店',
                addressTc: '高雄市左營區站前北路1號3樓（環球購物中心新左營車站）',
                guide: {
                  intro: 'Two hours is plenty for beginner and intermediate bouldering.',
                  steps: [
                    {
                      label: 'Buy',
                      detail: 'NT$430 entry plus shoes on Global Mall Online (card or LINE Pay); collect at counter.'
                    },
                    {
                      label: 'Check in',
                      detail: 'Sign waiver, collect shoes, quick orientation.'
                    },
                    {
                      label: 'Refuel',
                      detail: 'Protein snack in the mall\'s 2F food hall.'
                    },
                    {
                      label: 'Tired?',
                      detail: 'Leave ~1:15 PM if arms are done.'
                    }
                  ],
                  recheck: 'A few days before: current hours and price with shoes.'
                }
              },
              {
                time: '1:45 PM – 2:45 PM',
                title: 'Collect Luggage → Airline Inn Check-In',
                titleTc: '取行李 → 頭等艙飯店入住',
                icon: 'building-2',
                notes: 'Check-in opens 3:00 PM: drop bags at front desk, check in later. 建國三路33號, tel +886-7-285-3888.',
                navigateTo: '高雄市三民區建國三路33號',
                addressTc: '高雄市三民區建國三路33號',
                guide: {
                  steps: [
                    {
                      label: 'Collect',
                      detail: 'Empty lockers; KMRT Zuoying is in the same complex.'
                    },
                    {
                      label: 'MRT',
                      detail: 'Red Line towards Siaogang (小港), five stops to Kaohsiung Main (R11).'
                    },
                    {
                      label: 'Hotel',
                      detail: '3–5 min walk; leave bags, have the 25 g whey.'
                    },
                    {
                      label: 'To Pier-2',
                      detail: 'Red Line to Formosa Boulevard, Orange Line to Yanchengpu (O2); or taxi to 大勇路1號.'
                    }
                  ]
                }
              },
              {
                time: '3:15 PM – 4:15 PM',
                title: 'Pier-2 / Warehouse & Harbour Corridor',
                titleTc: '駁二藝術特區・倉庫與港區',
                icon: 'camera',
                notes: '60 min max, outdoors only. Free; Fridays 10:00 AM – 8:00 PM. Festival setup may close P2/P3, bicycle warehouse, B3/B4/B9.',
                navigateTo: '駁二藝術特區',
                addressTc: '高雄市鹽埕區大勇路1號',
                guide: {
                  steps: [
                    {
                      label: 'Start',
                      detail: 'Yanchengpu (O2) to Dayong warehouses, 大勇路1號.'
                    },
                    {
                      label: 'Walk west',
                      detail: 'Follow the light rail through Dayi (C6–C11) to Penglai B-warehouses, outside.'
                    },
                    {
                      label: 'Tower',
                      detail: 'NT$10 coin entry to Pier-2 Tower (until 7:30 PM).'
                    }
                  ]
                }
              },
              {
                time: '4:15 PM – 5:00 PM',
                title: 'Yancheng Early Dinner',
                titleTc: '鹽埕晚餐',
                icon: 'utensils',
                notes: '鴨肉珍 (Bib Gourmand): Friday until 8:20 PM, closed Tuesday. Aim for 40 g+ protein before karting.',
                navigateTo: '捷運鹽埕埔站',
                addressTc: '高雄市鹽埕區大勇路96號（捷運鹽埕埔站）',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: '鴨肉珍 near Yanchengpu (O2): duck rice (鴨肉飯) each + shared sliced duck (鴨肉).'
                    },
                    {
                      label: 'Still hungry',
                      detail: 'Tube rice cake (筒仔米糕) at 北港蔡三代筒仔米糕.'
                    },
                    {
                      label: 'Backup',
                      detail: 'Long line? 北港蔡筒仔米糕 (河西路167號, cash): rice cake + pork-rib or egg soup; 旗魚 = swordfish.'
                    },
                    {
                      label: 'Skip',
                      detail: '鄭家切仔麵; closes 3:00 PM.'
                    }
                  ]
                }
              },
              {
                time: '5:00 PM – 5:30 PM',
                title: 'Taxi to Suzuka Circuit Park',
                titleTc: '計程車往鈴鹿賽道樂園',
                icon: 'car',
                notes: '~30-min taxi to Mini Suzuka Circuit, SKM Park, 高雄市前鎮區中安路1-1號.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'Hail in Yancheng or book 55688 / Uber; one car for three.'
                    },
                    {
                      label: 'MRT option',
                      detail: 'Orange Line to Formosa Boulevard, Red Line south to Caoya (草衙, R4A).'
                    },
                    {
                      label: 'Dress',
                      detail: 'Long trousers and closed shoes for karting.'
                    }
                  ]
                }
              },
              {
                time: '5:30 PM – 6:30 PM',
                title: 'Mini Suzuka Kart (If the Wait Is Short)',
                titleTc: '鈴鹿賽道樂園・卡丁車（等候短才玩）',
                icon: 'car',
                notes: 'Free entry, pay per ride; Friday 11:00 AM – 8:30 PM, last tickets 30 min before close. Drivers 155 cm+, sober, long trousers, closed shoes.',
                navigateTo: '高雄鈴鹿賽道樂園',
                addressTc: '高雄市前鎮區中安路1-1號（SKM Park）',
                guide: {
                  intro: 'Free entry; karting is ticketed per ride.',
                  steps: [
                    {
                      label: 'On arrival',
                      detail: 'Ask next session: under 30 min wait, go; longer, skip immediately.'
                    },
                    {
                      label: 'Pay',
                      detail: 'NT$650 each (Birel N35, weekdays) + NT$100 briefing.'
                    },
                    {
                      label: 'If skipped',
                      detail: 'Taxi straight to E7PLAY Sanduo; start early.'
                    }
                  ]
                }
              },
              {
                time: '7:00 PM – 7:30 PM',
                title: 'Taxi to E7PLAY Sanduo',
                titleTc: '計程車往 E7PLAY 三多',
                icon: 'car',
                notes: '20–30 min taxi to E7PLAY Sanduo, 苓雅區三多一路335號2樓 (above 小北百貨, opposite 三信家商).',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'Book 55688 or Uber to 高雄市苓雅區三多一路335號.'
                    },
                    {
                      label: 'MRT option',
                      detail: 'Red Line to Formosa Boulevard, Orange Line east to Wukuaicuo (五塊厝) Exit 4.'
                    },
                    {
                      label: 'Cash',
                      detail: 'E7PLAY takes only Taiwan-issued cards, LINE Pay or TWQR.'
                    }
                  ]
                }
              },
              {
                time: '7:30 PM – 10:30 PM',
                title: 'E7PLAY Sanduo — Bowling, Billiards, Darts, Arcade',
                titleTc: 'E7PLAY 三多店・保齡球・撞球・飛鏢・電玩',
                icon: 'gamepad-2',
                notes: 'One ticket; open until 2:30 AM. Friday after 6:00 PM: NT$350 for three hours + 10% fee = NT$385 each; overtime NT$60 per 30 min.',
                navigateTo: 'E7PLAY 三多店',
                addressTc: '高雄市苓雅區三多一路335號2樓',
                guide: {
                  intro: 'A primary activity tonight, not a fallback.',
                  steps: [
                    {
                      label: 'Pay',
                      detail: 'Cash at 2F counter; one registers on E7 app first for buy-one-get-one coupon.'
                    },
                    {
                      label: 'Bowling first',
                      detail: 'Ask for a lane; if waiting, pool and darts until called.'
                    },
                    {
                      label: 'Rotate',
                      detail: 'Darts and arcade for the last half-hour.'
                    }
                  ],
                  exit: 'Late food from ~10:40 PM; hotel ~11:45 PM.'
                }
              },
              {
                time: '10:40 PM – 11:30 PM',
                title: 'Late Food',
                titleTc: '宵夜',
                icon: 'utensils',
                notes: 'Liuhe Night Market (六合夜市), near MRT Formosa Boulevard, between E7PLAY and the hotel. One protein-heavy stop; hotel ~11:45 PM.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'E7PLAY → Liuhe Night Market, 六合二路.'
                    },
                    {
                      label: 'Order',
                      detail: 'Meat skewers, night-market steak or braised snacks (滷味); or salt-steamed shrimp or squid.'
                    },
                    {
                      label: 'Back',
                      detail: 'Short taxi to 建國三路33號; finish check-in at the front desk.'
                    },
                    {
                      label: 'Too tired?',
                      detail: 'Skip Liuhe: tea eggs, chicken breast at a store near Kaohsiung Main.'
                    }
                  ]
                }
              }
            ],
            backups: {
              activity: {
                title: 'If E7PLAY is packed: late Liuhe + harbour walk',
                titleTc: '六合夜市＋港邊散步',
                note: 'Liuhe Night Market and a late harbour walk instead.',
                navigateTo: '六合觀光夜市'
              },
              foods: [
                {
                  title: 'Din Tai Fung Kaohsiung',
                  titleTc: '鼎泰豐 高雄店',
                  note: 'Reliable dumplings near Zuoying if lunch plans slip.',
                  navigateTo: '高雄市左營區博愛二路777號B1'
                }
              ]
            },
            foodRecommendation: 'Fenyang Wonton founding shop 老左營汾陽餛飩 (old Zuoying) → Yancheng local dinner 鹽埕',
            proteinHeadline: '50 g whey · food ~100 g',
            proteinPlan: '25 g whey at breakfast + after check-in; wontons plus a side before climbing; Yancheng dinner 40 g+.',
            insiderTip: 'Store bags at Zuoying, climb, then check in. Paid: bouldering ~US$13 with shoes, kart if short wait, E7PLAY ~US$12.'
          },
          {
            id: 'day-08',
            dayNum: '08',
            shortLabel: 'Tainan / 台南',
            city: 'Tainan Day Trip / 台南一日',
            dateString: 'Sat, Dec 05, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Ten Drum Cultural Village → Tainan Food → Wusheng Night Market',
            titleTc: '十鼓文創園區・台南小吃・武聖夜市',
            hotelRef: 'kaohsiung',
            transitSummary: 'TRA to Bao\'an + taxi into central Tainan + TRA back',
            weatherExpected: '~79°F • Warm southern climate',
            rainBackupAvailable: true,
            easyPlan: 'Leave Ten Drum after the 3:00 PM drum show; straight to Wusheng.',
            rainPlan: 'Rain: industrial zones, one show, any indoor activity, then leave early; not six hours.',
            leaveByTime: '8:15 AM from hotel',
            timeline: [
              {
                time: '8:24 AM – 9:20 AM',
                title: 'TRA: Kaohsiung → Bao\'an Station',
                titleTc: '台鐵：高雄 → 保安站',
                icon: 'train',
                notes: 'Local 3152, direct; NT$85, unreserved. Earlier: 3146 at 7:50 AM, arrives 8:52 AM. Don\'t detour via central Tainan.',
                navigateTo: 'Kaohsiung Main Station, Sanmin District, Kaohsiung',
                guide: {
                  steps: [
                    {
                      label: 'Leave by',
                      detail: '8:15 AM; TRA Kaohsiung Station is 3–5 min walk.'
                    },
                    {
                      label: 'Pay',
                      detail: 'Tap EasyCard at TRA gates; local (區間) trains need no booking.'
                    },
                    {
                      label: 'Pack',
                      detail: 'Soy milk and water; Ten Drum lunch is simple.'
                    },
                    {
                      label: 'Get off',
                      detail: 'Bao\'an (保安) is small; be at the doors when announced.'
                    }
                  ]
                }
              },
              {
                time: '~9:20 AM – 9:30 AM',
                title: 'Bao\'an Station → Ten Drum (walk or short taxi)',
                titleTc: '保安站 → 十鼓文創園區',
                icon: 'footprints',
                notes: 'Ten Drum: 臺南市仁德區文華路二段326號, tel 06-2662225, beside the station; opens 9:30 AM Saturdays.',
                navigateTo: '十鼓文創園區',
                addressTc: '台南市仁德區文華路二段326號',
                guide: {
                  steps: [
                    {
                      label: 'Photos',
                      detail: '5 min at the wooden station; free.'
                    },
                    {
                      label: 'Walk',
                      detail: 'To 文華路二段326號; taxi only if raining.'
                    }
                  ]
                }
              },
              {
                time: '9:30 AM – 3:30 PM',
                title: 'Ten Drum Cultural Village',
                titleTc: '十鼓文創園區',
                icon: 'drum',
                notes: 'Saturday 9:30 AM – 5:50 PM; attractions pause 11:45 AM – 1:10 PM. Ticket incl. one drum show: NT$509 gate, NT$458 via Ten Drum LINE.',
                navigateTo: '十鼓文創園區',
                addressTc: '台南市仁德區文華路二段326號',
                guide: {
                  intro: 'Multiple mini-activities, not a museum.',
                  steps: [
                    {
                      label: '9:30 AM',
                      detail: 'Exchange tickets at booth; book 3:00 PM show seats; sign extreme-activity consent.'
                    },
                    {
                      label: 'Morning',
                      detail: 'Outdoor Archery, Chimney Slide, Transparent Climbing Wall, Pole Rowing (check December notice).'
                    },
                    {
                      label: '11:45 AM',
                      detail: 'Lunch at 十鼓餐廳 or 蜜橋咖啡; meatiest set plus soy milk.'
                    },
                    {
                      label: '1:10 PM',
                      detail: 'Zipline (120 cm min, 30–110 kg), Sky Swing, Free Fall, Laser Tag; closed-toe shoes, trousers.'
                    }
                  ],
                  exit: 'Leave after thrills and the 3:00 PM show; single entry, no re-entry.'
                }
              },
              {
                time: '~3:30 PM – 4:00 PM',
                title: 'Taxi into Central Tainan',
                titleTc: '計程車前往台南市區',
                icon: 'car',
                notes: 'Uber, 55688 or street taxi. Cheaper: local train Bao\'an → Tainan, NT$22, 6–7 min (3:37, 3:48, 4:08, 4:13, 4:33 PM).',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'To 樑記正老店牛肉湯, 郡西路10號; one car for three.'
                    },
                    {
                      label: 'Train option',
                      detail: 'Tap EasyCard for the 3:48 or 4:08 PM; short taxi from Tainan Station.'
                    },
                    {
                      label: 'No rush',
                      detail: 'Wusheng opens 5:00 PM.'
                    }
                  ]
                }
              },
              {
                time: '4:00 PM – 4:50 PM',
                title: 'Tainan Fresh Beef Soup — 樑記 + Guohua Street',
                titleTc: '台南牛肉湯・樑記正老店＋國華街',
                icon: 'utensils',
                notes: '樑記正老店牛肉湯, 郡西路10號, tel 0926-830-306; 11:30 AM – 8:00 PM, closed Mondays.',
                navigateTo: '樑記正老店牛肉湯 郡西路10號',
                addressTc: '台南市中西區郡西路10號',
                guide: {
                  steps: [
                    {
                      label: 'Beef soup',
                      detail: 'Beef soup (牛肉湯) + small braised pork rice (肉燥飯) each; plate of beef if hungry.'
                    },
                    {
                      label: 'Backup',
                      detail: 'Shut? 醇涎坊古早味鍋燒意麵 (保安路53號): noodles in broth (鍋燒意麵).'
                    },
                    {
                      label: 'Snack walk',
                      detail: '4:30 PM: 國華街, one shared pork belly bun (割包).'
                    },
                    {
                      label: 'Then',
                      detail: 'Taxi to Wusheng (武聖路69巷 × 光賢街); graze, no second dinner.'
                    }
                  ]
                }
              },
              {
                time: '5:15 PM – 6:45 PM',
                title: 'Wusheng Night Market — Food & Games',
                titleTc: '武聖夜市・小吃與遊戲',
                icon: 'store',
                notes: '75–90 min max; don\'t walk all stalls. Open Wednesday, Friday, Saturday 5:00 PM – midnight.',
                navigateTo: '武聖夜市 台南',
                addressTc: '台南市中西區武聖路69巷與光賢街口',
                guide: {
                  steps: [
                    {
                      label: 'Games first',
                      detail: 'By 5:15 PM: ring toss (套圈圈), balloon shooting, darts, pinball (打彈珠).'
                    },
                    {
                      label: 'Protein',
                      detail: '阿誠牛肉湯 beef soup, extra beef; grilled meat skewers.'
                    },
                    {
                      label: 'Dessert',
                      detail: 'Share 阿堯師雞蛋糕 (egg sponge cakes), 陳家阿嬤拔絲地瓜 (candied sweet potato), 古玥茶 soy-milk black tea.'
                    },
                    {
                      label: 'Too crowded?',
                      detail: 'Garden Night Market (花園夜市) also runs Saturdays.'
                    }
                  ]
                }
              },
              {
                time: '~7:00 PM – 8:30 PM',
                title: 'Taxi to Tainan Station → TRA to Kaohsiung',
                titleTc: '計程車往台南站 → 台鐵返回高雄',
                icon: 'train',
                notes: 'Tze-Chiang (自強) NT$158, 30–37 min; local (區間) NT$102, ~1 hour. Station to hotel 3–5 min walk.',
                navigateTo: 'Tainan Railway Station, East District, Tainan',
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'Uber or 55688 from Wusheng to Tainan Station (台南火車站).'
                    },
                    {
                      label: 'Train',
                      detail: 'Next Tze-Chiang in TRA app (book Saturday-night seats), or EasyCard local.'
                    },
                    {
                      label: 'Late fallback',
                      detail: 'Tze-Chiang 9:54, 10:29, 11:22 PM; last 11:46 PM (arrives 12:21 AM).'
                    }
                  ]
                }
              },
              {
                time: '8:30 PM – 9:00 PM',
                title: 'Protein / Snack Near Kaohsiung Station',
                titleTc: '高雄車站附近補充',
                icon: 'utensils',
                notes: 'Only if Wusheng fell short on protein; 25 g whey either way.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Buy',
                      detail: '7-Eleven or FamilyMart: tea eggs (茶葉蛋), chicken breast (雞胸肉), unsweetened soy milk.'
                    },
                    {
                      label: 'Skip',
                      detail: 'Full? Straight to the hotel.'
                    }
                  ]
                }
              },
              {
                time: '~9:15 PM – 9:30 PM',
                title: 'Back to the Hotel',
                titleTc: '返回飯店',
                icon: 'building-2',
                notes: 'Early: tomorrow\'s charter leaves 7:15 AM. Airline Inn: 3–5 min walk from Kaohsiung Station.',
                navigateTo: '高雄市三民區建國三路33號',
                addressTc: '高雄市三民區建國三路33號',
                guide: {
                  steps: [
                    {
                      label: 'Whey',
                      detail: '25 g whey shake.'
                    },
                    {
                      label: 'Pack',
                      detail: 'Lay out clothes and bags; alarms for the 7:15 AM charter.'
                    }
                  ]
                }
              }
            ],
            backups: {
              foods: [
                {
                  title: 'A-Cai Beef Soup',
                  titleTc: '阿財牛肉湯 平豐店',
                  note: 'Beef soup open late, if you want a sit-down meal instead of night-market grazing.',
                  navigateTo: '台南市安平區平豐路277號'
                }
              ]
            },
            foodRecommendation: 'Lunch inside Ten Drum → 友愛牛肉湯 / Tainan small eats → 武聖夜市 (阿誠牛肉湯・阿堯師雞蛋糕)',
            proteinHeadline: '50 g whey · food ~100 g',
            proteinPlan: '25 g whey at breakfast + in Kaohsiung; soy milk at Ten Drum; beef soup, extra beef; Wusheng grilled meat.',
            insiderTip: 'Skipped: Anping Fort, Anping Tree House, Hayashi, Confucius Temple, Shennong Street, Chihkan Tower. Paid: Ten Drum ~US$14–16.'
          },
          {
            id: 'day-09',
            dayNum: '09',
            shortLabel: 'Maolin / 茂林',
            city: 'Kaohsiung / 高雄',
            dateString: 'Sun, Dec 06, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Maolin Butterflies → Market → Qishan Mazu → Kaohsiung Night (Ruifeng as Backup)',
            titleTc: '茂林紫蝶・市集・旗山媽祖・高雄夜（瑞豐備案）',
            hotelRef: 'kaohsiung',
            transitSummary: '12-hour charter (7:15 AM → ~7:15 PM) + MRT back',
            weatherExpected: '~75°F • Warm south; cooler and damp in the Maolin valley early',
            rainBackupAvailable: true,
            easyPlan: 'Never cut the butterflies; Qishan procession next. Longtoushan, Moon World, Ruifeng: backups only.',
            rainPlan: 'Poor butterfly weather: shorten Maolin, Qishan earlier. No procession: Moon World. Charter collapses: Kaohsiung, E7PLAY.',
            leaveByTime: '7:15 AM driver pickup',
            timeline: [
              {
                time: '7:15 AM – 8:30 AM',
                title: 'Private Charter Pickup → Maolin',
                titleTc: '包車出發 → 茂林',
                icon: 'car',
                notes: 'Driver collects 7:15 AM outside Airline Inn (建國三路33號); charter ends ~7:15 PM. Butterflies best until ~11 AM – don\'t delay.',
                navigateTo: '高雄市三民區建國三路33號',
                addressTc: '高雄市三民區建國三路33號',
                guide: {
                  steps: [
                    {
                      label: 'Forecast',
                      detail: 'Night before: check 蝶況預報 butterfly forecast (1–5 stars, best trail).'
                    },
                    {
                      label: 'Driver\'s order',
                      detail: 'Refuel first. Butterfly Park → Qishan → Moon World if time → Kaohsiung.'
                    },
                    {
                      label: 'Before pickup',
                      detail: 'Breakfast, 25 g whey; pack soy milk, water, sunscreen, insect repellent.'
                    },
                    {
                      label: 'Visitor info',
                      detail: 'Maolin Visitor Center: 茂林巷7-7號, 07-680-1111, 9:00 AM – 5:00 PM.'
                    }
                  ]
                }
              },
              {
                time: '~8:30 AM – 10:00 AM',
                title: 'Maolin Purple Butterfly Valley',
                titleTc: '茂林紫蝶幽谷',
                icon: 'flower-2',
                notes: 'Free, open 24 hours; season October–February. Keep the full 90 minutes; overcast or rain: cut short, Qishan earlier.',
                navigateTo: '茂林紫蝶生態公園',
                addressTc: '高雄市茂林區茂林里1鄰16號對面（紫蝶生態公園）',
                guide: {
                  steps: [
                    {
                      label: 'Trail',
                      detail: 'Skip exhibits; walk 姿沙里沙里步道 from entrance (opposite 茂林里1鄰16號), ~50 min.'
                    },
                    {
                      label: 'Look for',
                      detail: 'Before sun hits: closed-wing bunches on trees; wait for wings to open.'
                    },
                    {
                      label: 'Viewpoints',
                      detail: 'Village deck, then 瑪雅亭 lookout.'
                    },
                    {
                      label: 'Leave by',
                      detail: '10:00 AM at the entrance.'
                    }
                  ]
                }
              },
              {
                time: '10:00 AM – 10:40 AM',
                title: 'Butterfly Festival Market (Dec 5–6)',
                titleTc: '紫蝶季市集',
                icon: 'store',
                notes: 'Free 護蝶市集, 10:00 AM – 4:00 PM, Dec 5–6. Only catch a performance already starting; first singers 11:00 AM.',
                navigateTo: '茂林紫蝶生態公園',
                addressTc: '高雄市茂林區茂林里1鄰16號對面（紫蝶生態公園）',
                guide: {
                  steps: [
                    {
                      label: 'Eat',
                      detail: 'One savoury snack each: 阿拜 (abai, millet in leaves) or stone-slab grilled meat.'
                    },
                    {
                      label: 'Browse',
                      detail: 'One pass of the craft and produce stalls.'
                    },
                    {
                      label: 'Skip',
                      detail: 'Leather-carving keychain DIY (10:00–11:00 AM) – eats the Longtoushan slot.'
                    },
                    {
                      label: 'Leave by',
                      detail: '10:25 AM for Longtoushan; straight to Qishan if procession starts early.'
                    }
                  ]
                }
              },
              {
                time: '10:45 AM – 11:30 AM',
                title: 'Drive to Qishan',
                titleTc: '車程前往旗山',
                icon: 'car',
                notes: '~45 minutes. Longtoushan (Little Great Wall) only if the Mazu timetable leaves a big buffer.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Drop-off',
                      detail: 'Qishan Station on 中山路, not the temple – roads around 旗山天后宮 road-controlled.'
                    },
                    {
                      label: 'Pickup plan',
                      detail: 'Agree pickup point and how to phone the driver.'
                    },
                    {
                      label: 'In car',
                      detail: 'Check the temple\'s Nov 3 route timings; pick a meeting point.'
                    }
                  ]
                }
              },
              {
                time: '~11:45 AM – 12:45 PM',
                title: 'Qishan Lunch — Xiuming Pork-Heart Vermicelli',
                titleTc: '旗山秀明豬心冬粉',
                icon: 'utensils',
                notes: '旗山秀明豬心冬粉, 永平街41號, Qishan Old Street; 07-662-4625; 8:30 AM – 3:30 PM, closed Mondays.',
                navigateTo: '旗山秀明豬心冬粉 永平街41號',
                addressTc: '高雄市旗山區永平街41號',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: '豬心冬粉 (pork-heart vermicelli) each; share sliced pork, liver or intestine; braised egg each.'
                    },
                    {
                      label: 'Dessert',
                      detail: 'Share one banana treat: egg rolls, banana ice or almond tea; 朝林冰果室.'
                    },
                    {
                      label: 'Quick look',
                      detail: 'Qishan Station (糖鐵故事館), weekends 10:00 AM – 7:00 PM, if five minutes spare.'
                    },
                    {
                      label: 'Leave by',
                      detail: '12:55 PM, on foot to the procession route.'
                    }
                  ]
                }
              },
              {
                time: '~1:00 PM – 4:00 PM',
                title: '2026 Qilu Tongfu Mazu Procession — Qishan',
                titleTc: '2026 旗鹿同福・媽祖遶境',
                icon: 'sparkles',
                notes: 'Free; Sunday Dec 6 at 旗山天后宮. Aim for 2–3 hours; stay into the evening if excellent.',
                navigateTo: '旗山天后宮',
                addressTc: '高雄市旗山區永福街23巷16號',
                guide: {
                  intro: 'Lukang Mazu comes south to Qishan for a joint procession.',
                  steps: [
                    {
                      label: 'Timing',
                      detail: 'Save the temple\'s Nov 3 Facebook route image (login needed). Line: 07-661-2037.'
                    },
                    {
                      label: 'If early',
                      detail: 'Cut Longtoushan, never the butterflies.'
                    },
                    {
                      label: 'First pass',
                      detail: 'Meet it on route, walk 45–60 min, leave; 躦轎腳 only at announced spots.'
                    },
                    {
                      label: 'Rejoin',
                      detail: 'Only if the driver can intercept a later phase; else Moon World or Ruifeng.'
                    }
                  ],
                  recheck: 'Morning of: check temple\'s Facebook against the Nov 3 timings.'
                },
                live: {
                  label: 'Organiser updates',
                  url: 'https://khh.travel/zh-tw/event/calendardetail/8049/'
                }
              },
              {
                time: '~4:15 PM – 5:00 PM',
                title: 'Tianliao Moon World (If You\'ve Seen Enough)',
                titleTc: '田寮月世界（看夠遶境再去）',
                icon: 'mountain',
                notes: 'Flex only: 45–60-minute loop walk. Visitor centre 10:00 AM – 5:00 PM; landscape open all day; no fee listed.',
                navigateTo: '田寮月世界遊客中心',
                addressTc: '高雄市田寮區月球路36號',
                guide: {
                  steps: [
                    {
                      label: 'Go/drop',
                      detail: 'Only if procession winds down by ~3:00 PM; first to drop.'
                    },
                    {
                      label: 'Route',
                      detail: 'Driver to visitor centre (月球路36號); waits in car park.'
                    },
                    {
                      label: 'Walk',
                      detail: 'Loop from the visitor centre and back.'
                    },
                    {
                      label: 'Leave by',
                      detail: '4:30 PM for the 5:15 PM Ruifeng drop.'
                    }
                  ]
                }
              },
              {
                time: '~5:15 PM – 6:00 PM',
                title: 'Driver Back to Kaohsiung (or Stay in Qishan)',
                titleTc: '包車送達瑞豐夜市（情境A）',
                icon: 'car',
                notes: 'Procession still excellent: stay and eat in Qishan. Otherwise drop at Ruifeng or hotel before ~7:15 PM.',
                navigateTo: '高雄市三民區建國三路33號',
                addressTc: '高雄市三民區建國三路33號',
                guide: {
                  steps: [
                    {
                      label: 'Drop point',
                      detail: '南屏路 × 裕誠路 by Kaohsiung Arena – same as Red Line 巨蛋 (R14) Exit 1.'
                    },
                    {
                      label: 'Unload',
                      detail: 'Take everything; this drop ends the charter.'
                    }
                  ]
                }
              },
              {
                time: '6:00 PM – 7:00 PM',
                title: 'Ruifeng Night Market — Backup Dinner & Games',
                titleTc: '瑞豐夜市・晚餐與遊戲',
                icon: 'store',
                notes: 'Backup only, if procession ended early. Open 5:00 PM – midnight; closed Mondays and Wednesdays (Sunday Dec 6 open).',
                navigateTo: '高雄市左營區南屏路／裕誠路 瑞豐夜市',
                addressTc: '高雄市左營區南屏路／裕誠路 瑞豐夜市',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: '曾氏福建炒麵 (Fujian fried noodles), 天使雞排 (chicken cutlet); add skewers, sausage or grilled seafood.'
                    },
                    {
                      label: 'Games',
                      detail: 'Two or three: ring toss (套圈圈), balloon shooting (射氣球).'
                    },
                    {
                      label: 'Route',
                      detail: 'One loop of the grid, eating as you go.'
                    },
                    {
                      label: 'Leave by',
                      detail: '7:00 PM for the Music Center.'
                    }
                  ],
                  exit: 'Leave at 7:00 PM even mid-snack: 60-minute cap.'
                }
              },
              {
                time: '7:30 PM – 8:30 PM',
                title: 'Kaohsiung Music Center → Love River',
                titleTc: '高雄流行音樂中心 → 愛河',
                icon: 'footprints',
                notes: 'Music Center outdoor areas open; indoor venues events only. Love River lights: 愛河之心 and 光之塔 to 真愛碼頭.',
                navigateTo: '高雄流行音樂中心',
                addressTc: '高雄市鹽埕區真愛路1號',
                guide: {
                  steps: [
                    {
                      label: 'Get there',
                      detail: 'Taxi to 真愛路1號, or Light Rail C10 光榮碼頭 / C11 真愛碼頭 / C12 駁二大義.'
                    },
                    {
                      label: 'Walk',
                      detail: 'Wave Tower (音浪塔) at C11; Coral Reef, Whale Embankment at C10; Love River north-east.'
                    },
                    {
                      label: 'Optional boat',
                      detail: '25-minute gondola round trip from 河東路 × 民生路; ask fares at dock.'
                    },
                    {
                      label: 'Leave by',
                      detail: '8:30 PM: Orange Line 鹽埕埔 (O2) → 美麗島 (O5/R10), or taxi.'
                    }
                  ]
                }
              },
              {
                time: '8:45 PM – 9:30 PM',
                title: 'Liuhe / Formosa Boulevard Late Pass',
                titleTc: '六合夜市・美麗島站',
                icon: 'moon',
                notes: 'Dessert or snack only, not dinner. Daily 5:00 PM – 2:00 AM on Liuhe 2nd Road.',
                navigateTo: '六合觀光夜市',
                addressTc: '高雄市新興區六合二路（中山一路口）',
                guide: {
                  steps: [
                    {
                      label: 'Light dome',
                      detail: 'Inside 美麗島 (R10), look up at the Dome of Light (光之穹頂).'
                    },
                    {
                      label: 'Right exit',
                      detail: 'Exit 1 or 11 (signed 六合觀光夜市); others leave you across Zhongshan Road.'
                    },
                    {
                      label: 'Order',
                      detail: 'One each: papaya milk (木瓜牛奶), or share seafood congee, salt-steamed shrimp or mullet gizzard.'
                    },
                    {
                      label: 'Leave by',
                      detail: '9:30 PM.'
                    }
                  ]
                }
              },
              {
                time: '~10:00 PM – 10:45 PM',
                title: 'Back to the Hotel',
                titleTc: '返回飯店',
                icon: 'building-2',
                notes: 'Red Line one stop, 美麗島 (R10) → 高雄車站 (R11), then ~500 m walk.',
                navigateTo: '高雄市三民區建國三路33號',
                addressTc: '高雄市三民區建國三路33號',
                guide: {
                  steps: [
                    {
                      label: 'MRT',
                      detail: 'Toward 岡山車站 on EasyCard; last train 12:21 AM.'
                    },
                    {
                      label: 'Walk',
                      detail: 'To Airline Inn (建國三路33號).'
                    },
                    {
                      label: 'Tonight',
                      detail: 'Second 25 g whey; alarms for 7:45 AM taxi to Shoushan.'
                    }
                  ]
                }
              }
            ],
            backups: {
              activity: {
                title: 'Longtoushan / Little Great Wall (backup)',
                titleTc: '龍頭山・小長城（備案）',
                note: 'Only if the Mazu timetable leaves a big buffer: the ridge boardwalk out and back, 45–60 minutes, on the way from Maolin to Qishan.',
                navigateTo: '高雄市茂林區 高132線12公里附近（龍頭山遊憩區・小長城步道）'
              }
            },
            foodRecommendation: 'Early breakfast → Maolin market snacks → Qishan lunch → Qishan dinner, or Ruifeng (曾氏福建炒麵・天使雞排) if procession ends early',
            proteinHeadline: '50 g whey · food ~100 g',
            proteinPlan: '25 g whey before pickup + 25 g tonight; meaty Qishan lunch, grilled-meat dinner, soy milk in car.',
            insiderTip: 'Book a 12-hour charter, not 10: Tripool, KKday / Klook or 55688, ~US$55–65 each. Not Uber Hourly.'
          },
          {
            id: 'day-10',
            dayNum: '10',
            shortLabel: 'Cijin / 旗津',
            city: 'Kaohsiung / 高雄',
            dateString: 'Mon, Dec 07, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Shoushan → Cijin → Reset → Shrimp Fishing → Late Kaohsiung',
            titleTc: '壽山・旗津・休息・釣蝦・高雄夜',
            hotelRef: 'kaohsiung',
            transitSummary: 'Taxi to the trailhead + ferry + MRT / taxi to Zuoying',
            weatherExpected: '~79°F • Pleasant southern-coast range',
            rainBackupAvailable: true,
            easyPlan: 'Shorten the Shoushan loop or Cijin paths; keep evening shrimp fishing.',
            rainPlan: 'Wet limestone: shorten or skip hike; Cijin ferry if it clears; keep indoor shrimp fishing.',
            leaveByTime: '7:20 AM from hotel',
            timeline: [
              {
                time: '7:30 AM – 8:00 AM',
                title: 'Local Breakfast — Cianjin Braised Pork Rice',
                titleTc: '在地早餐・前金肉燥飯',
                icon: 'utensils',
                notes: '前金肉燥飯, 大同二路26號; Mon–Fri 7:30 AM – 5:30 PM, Sat to 2:00 PM, closed Sundays.',
                navigateTo: '前金肉燥飯 大同二路26號',
                addressTc: '高雄市前金區大同二路26號',
                guide: {
                  steps: [
                    {
                      label: 'Get there',
                      detail: 'Leave hotel 7:20 AM: short taxi or 20-minute walk south-west.'
                    },
                    {
                      label: 'Order',
                      detail: 'Each: 肉燥飯, 滷鴨蛋 (braised duck egg), 滷豆腐 (braised tofu); add clear soup.'
                    },
                    {
                      label: 'Leave by',
                      detail: '8:00 AM, taxi to the trailhead.'
                    }
                  ]
                }
              },
              {
                time: '8:00 AM – 8:20 AM',
                title: 'Taxi to the Shoushan Trailhead',
                titleTc: '計程車前往壽山登山口',
                icon: 'car',
                notes: 'To 龍泉寺登山口 (鼓山三路51巷), start of route 1; quicker than MRT plus walk.',
                navigateTo: '柴山 龍泉寺登山口',
                addressTc: '高雄市鼓山區鼓山三路51巷（柴山龍泉寺登山口）',
                guide: {
                  steps: [
                    {
                      label: 'Before leaving',
                      detail: '25 g whey; seal snacks in a closed bag – macaques from the trailhead.'
                    },
                    {
                      label: 'Taxi',
                      detail: 'From 前金, taxi for three; ~20 min.'
                    },
                    {
                      label: 'Prepare',
                      detail: 'Download offline maps (patchy signal); carry water.'
                    }
                  ]
                }
              },
              {
                time: '~8:20 AM – 11:00 AM',
                title: 'Shoushan / Chaishan Hike',
                titleTc: '壽山／柴山健行',
                icon: 'mountain',
                notes: 'Free. Limestone trails with hands-and-feet sections; macaques – keep food in closed bags.',
                navigateTo: '柴山 龍泉寺登山口',
                addressTc: '高雄市鼓山區鼓山三路51巷（柴山龍泉寺登山口）',
                guide: {
                  intro: 'Kaohsiung\'s mountain on its doorstep.',
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Longquan Temple → 泰國谷, 一線天, 一簾幽夢 → 雅座亭 viewpoint; descend toward Gushan.'
                    },
                    {
                      label: 'Scramble',
                      detail: '盤榕道 banyan-root boulders; skip if rock is wet.'
                    },
                    {
                      label: 'Pace',
                      detail: 'Time the descent with junction signposts\' walking times.'
                    },
                    {
                      label: 'Descend',
                      detail: 'Gushan side by 11:00–11:15 AM for the ferry.'
                    }
                  ]
                },
                exitTo: '高雄市鼓山區濱海二路1號'
              },
              {
                time: '11:15 AM – 11:50 AM',
                title: 'Lunch — Dain-Dain Hamburger (Hamasen)',
                titleTc: '丹丹漢堡・哈瑪星',
                icon: 'utensils',
                notes: '丹丹漢堡 by the Gushan ferry: 臨海二路24號, 07-533-0573; 7:00 AM – 9:00 PM, closed Thursdays.',
                navigateTo: '丹丹漢堡 臨海二路24號',
                addressTc: '高雄市鼓山區臨海二路24號',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Spicy fried chicken burger set with 麵線羹 (vermicelli soup), extra chicken piece each.'
                    },
                    {
                      label: 'Leave by',
                      detail: '11:50 AM; walk to Gushan ferry pier.'
                    }
                  ]
                }
              },
              {
                time: '~11:55 AM – 12:10 PM',
                title: 'Descend to Gushan → Ferry to Cijin',
                titleTc: '下山至鼓山 → 渡輪往旗津',
                icon: 'ship',
                notes: '~5-minute crossing, NT$30 (coins or EasyCard / iPASS / icash 2.0). Pier under renovation; check boarding point on the day.',
                navigateTo: '高雄市鼓山區濱海二路1號',
                addressTc: '高雄市鼓山區濱海二路1號',
                guide: {
                  steps: [
                    {
                      label: 'To pier',
                      detail: 'Gushan Ferry Station (濱海二路1號); follow signs to temporary boarding (07-571-2542).'
                    },
                    {
                      label: 'Pay',
                      detail: 'Tap EasyCard or exact coins – cash is coins only.'
                    },
                    {
                      label: 'Frequency',
                      detail: 'Weekdays every 12–15 min, 9:50 AM – 4:10 PM; tides can shift sailings.'
                    },
                    {
                      label: 'Arrive',
                      detail: 'New Cijin Ferry Station (光之渡口) on 海岸路.'
                    }
                  ]
                }
              },
              {
                time: '12:30 PM – 1:30 PM',
                title: 'Cijin Headland — Lighthouse, Fort, Coastal Paths',
                titleTc: '旗津：旗后燈塔・旗后砲台・海岸步道',
                icon: 'footprints',
                notes: '60 minutes max; not the beach. Lighthouse (旗下巷34號, 07-571-5021) 10:00 AM – 9:00 PM daily; fort open all day.',
                navigateTo: '高雄市旗津區旗下巷34號',
                addressTc: '高雄市旗津區旗下巷34號',
                guide: {
                  steps: [
                    {
                      label: 'Lighthouse',
                      detail: 'Climb 旗後山 from near the ferry; see the old-equipment exhibition.'
                    },
                    {
                      label: 'Fort',
                      detail: 'Cihou Fort, south side of the hill; 威震天南 gate.'
                    },
                    {
                      label: 'Seafood snack',
                      detail: 'Share grilled squid or a seafood skewer on 廟前路 by Tianhou Temple.'
                    },
                    {
                      label: 'Leave by',
                      detail: '1:30 PM for the ferry; skip Cijin Beach.'
                    }
                  ]
                }
              },
              {
                time: '~1:30 PM – 1:50 PM',
                title: 'Ferry Back to Gushan',
                titleTc: '渡輪返回鼓山',
                icon: 'ship',
                notes: 'NT$30, ~5 minutes; boats every 12–15 minutes on weekday afternoons.',
                navigateTo: '旗津輪渡站',
                addressTc: '高雄市旗津區海岸路10號',
                guide: {
                  steps: [
                    {
                      label: 'Board',
                      detail: 'Cijin Ferry Station (海岸路10號); tap EasyCard or coins.'
                    },
                    {
                      label: 'Onward',
                      detail: 'At Gushan, walk to MRT 哈瑪星 (O1), Orange Line.'
                    }
                  ]
                }
              },
              {
                time: '2:00 PM – 2:45 PM',
                title: 'Optional Hotel Shower Stop',
                titleTc: '回飯店沖澡（可選）',
                icon: 'building-2',
                notes: 'Optional reset; skip it to gain 45 minutes.',
                navigateTo: '高雄市三民區建國三路33號',
                addressTc: '高雄市三民區建國三路33號',
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Orange Line 哈瑪星 (O1) → 美麗島 (O5/R10), Red Line to 高雄車站 (R11).'
                    },
                    {
                      label: 'At hotel',
                      detail: 'Shower, change, second 25 g whey.'
                    },
                    {
                      label: 'Leave by',
                      detail: '3:15 PM for Zuoying.'
                    }
                  ]
                }
              },
              {
                time: '~3:15 PM – 3:50 PM',
                title: 'Travel North to Zuoying',
                titleTc: '用餐・北上左營',
                icon: 'utensils',
                notes: 'Taxi straight to 文慈路76號: simplest for three; last-mile walk unverified.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'Hotel to 佰吉星釣蝦, 左營區文慈路76號.'
                    },
                    {
                      label: 'MRT option',
                      detail: 'Red Line 高雄車站 (R11) → 左營 (R16), then taxi the last stretch.'
                    }
                  ]
                }
              },
              {
                time: '~4:00 PM – 6:00 PM',
                title: 'Shrimp Fishing — 佰吉星釣蝦競技場',
                titleTc: '佰吉星釣蝦競技場',
                icon: 'fish',
                notes: 'Budget ~US$20–27 each for two hours; prices unpublished. Listed hours 2:00 PM – 8:00 AM; October reel shows it reopened, with 熱炒 kitchen.',
                navigateTo: '佰吉星釣蝦 文慈路76號',
                addressTc: '高雄市左營區文慈路76號',
                guide: {
                  steps: [
                    {
                      label: 'Day before',
                      detail: 'Call 07-350-3909: open? Rod price? Two rods for three? Cook the catch?'
                    },
                    {
                      label: 'Session',
                      detail: 'Prefer ~4:00–6:00 PM; otherwise 6:00–8:00 PM.'
                    },
                    {
                      label: 'Rods',
                      detail: 'Share two rods if allowed, swap often; ask staff to show bait set-up.'
                    },
                    {
                      label: 'Leave rule',
                      detail: 'Hate it? Leave after 60–75 minutes.'
                    }
                  ]
                }
              },
              {
                time: '~6:15 PM – 7:45 PM',
                title: 'Grill the Catch → Proper Dinner',
                titleTc: '烤蝦・宵夜・甜點・夜間散步',
                icon: 'utensils',
                notes: 'Kitchen cooks your catch on request (代客料理) and runs a full stir-fry menu. Fees unpublished; ask when ordering.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Catch',
                      detail: 'Hand shrimp to the kitchen; salt-grilled (鹽烤).'
                    },
                    {
                      label: 'Order',
                      detail: 'Chicken or pork stir-fry (crispy ginger chicken), an egg or tofu dish, rice.'
                    },
                    {
                      label: 'No fallback',
                      detail: 'Ruifeng is closed Mondays; don\'t count on it.'
                    }
                  ]
                }
              },
              {
                time: '8:30 PM – 9:30 PM',
                title: 'Harbour / Music Center or Liuhe Dessert',
                titleTc: '港邊・流行音樂中心或六合甜點',
                icon: 'moon',
                notes: 'Harbour and Music Center if skipped yesterday; otherwise Liuhe dessert (daily 5:00 PM – 2:00 AM).',
                navigateTo: '高雄流行音樂中心',
                addressTc: '高雄市鹽埕區真愛路1號',
                guide: {
                  steps: [
                    {
                      label: 'Music Center',
                      detail: 'Taxi to 真愛路1號; Wave Tower, Coral Reef, Whale Embankment, lit Love River.'
                    },
                    {
                      label: 'Liuhe',
                      detail: 'Red Line 左營 (R16) → 美麗島 (R10), Exit 1 or 11; papaya milk (木瓜牛奶).'
                    },
                    {
                      label: 'Backup',
                      detail: 'E7PLAY Sanduo: bowling, billiards, darts until late.'
                    }
                  ]
                }
              },
              {
                time: '~10:30 PM – 11:15 PM',
                title: 'Back to the Hotel',
                titleTc: '返回飯店',
                icon: 'building-2',
                notes: 'Taxi or MRT to Kaohsiung Station; pack for 8:30 AM checkout and THSR.',
                navigateTo: '高雄市三民區建國三路33號',
                addressTc: '高雄市三民區建國三路33號',
                guide: {
                  steps: [
                    {
                      label: 'MRT',
                      detail: '美麗島 (R10) → 高雄車站 (R11) toward 岡山車站; last 12:21 AM. From Zuoying, ride toward 小港.'
                    },
                    {
                      label: 'Taxi',
                      detail: 'From Music Center or E7PLAY: taxi to 建國三路33號.'
                    },
                    {
                      label: 'Tonight',
                      detail: 'Pack; online check-in for CX495; confirm breakfast hours at desk.'
                    }
                  ]
                }
              }
            ],
            backups: {
              activity: {
                title: 'E7PLAY Sanduo',
                titleTc: 'E7PLAY 三多店',
                note: 'If the shrimp hall is crowded or the vibe is off, bowling, billiards and darts until late.',
                navigateTo: 'E7PLAY 三多店'
              },
              services: [
                {
                  title: 'Cijin only (wet morning)',
                  titleTc: '只去旗津（雨天早上）',
                  note: 'If the trails are slick, skip Shoushan and give Cijin the morning.',
                  navigateTo: '高雄市鼓山區濱海二路1號'
                }
              ]
            },
            foodRecommendation: 'Cianjin braised pork rice → Dain-Dain Hamburger (Hamasen) before the ferry → grilled catch, then a proper dinner',
            proteinHeadline: '50 g whey · food ~100 g',
            proteinPlan: '25 g whey before Shoushan + 25 g at shower stop; Dain-Dain fried chicken, soup; grilled catch, proper dinner.',
            insiderTip: 'No second massage. Only paid item: shrimp fishing, ≤ ~US$25–27 each, 2–2.5 hours; two rods for three if allowed.'
          },
          {
            id: 'day-11',
            dayNum: '11',
            shortLabel: 'HK / 抵港',
            city: 'Hong Kong / 香港',
            dateString: 'Tue, Dec 08, 2026',
            timeZone: 'Asia/Taipei',
            title: 'THSR to TPE → Flight CX495 → Jordan → Temple Street → WinterFest',
            titleTc: '高鐵往桃園・CX495赴港・佐敦・廟街・冬日節',
            hotelRef: 'hk',
            transitSummary: 'MRT → THSR → Airport MRT → CX495 (1:20 PM) → Airport Express',
            weatherExpected: '~68°F • Cool evening conditions',
            leaveByTime: '8:30 AM checkout',
            timeline: [
              {
                time: '7:45 AM – 8:20 AM',
                title: 'Breakfast',
                titleTc: '早餐',
                icon: 'utensils',
                notes: 'Hotel B1 buffet 7:00–9:30 AM weekdays (Tue Dec 8 is one); confirm at the desk the night before.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Eat',
                      detail: 'Hot-counter eggs, congee with sides, 25 g whey.'
                    },
                    {
                      label: 'Earlier train',
                      detail: 'On the 9:00 AM THSR (0618)? Sit at 7:00 AM, leave 7:45 AM.'
                    },
                    {
                      label: 'Bags',
                      detail: 'Bring bags down; leave 8:30 AM (checkout 11:00 AM).'
                    }
                  ]
                }
              },
              {
                time: '~8:30 AM – 9:05 AM',
                title: 'Checkout → MRT to THSR Zuoying',
                titleTc: '退房 → 捷運往高鐵左營站',
                icon: 'luggage',
                notes: 'Red Line from 高雄車站 (R11) to 左營 (R16), toward 岡山.',
                navigateTo: 'THSR Zuoying Station, Kaohsiung',
                guide: {
                  steps: [
                    {
                      label: 'Walk',
                      detail: '~500 m to R11; Exits 1–3 have lifts, Exit 4 up-escalator only.'
                    },
                    {
                      label: 'Ride',
                      detail: 'To 左營 (R16) on EasyCard; no platform change.'
                    },
                    {
                      label: 'Exit 1',
                      detail: 'Exit 1 for THSR (Exit 2 is TRA); allow time at gates.'
                    }
                  ]
                }
              },
              {
                time: '9:35 AM – 11:09 AM',
                title: 'THSR: Zuoying → Taoyuan',
                titleTc: '台灣高鐵：左營 → 桃園',
                icon: 'train',
                notes: 'Train 0622: Zuoying 9:35 AM → Taoyuan 11:09 AM. Earlier option: 0618 at 9:00 AM (arr. 10:36 AM). Reserved ticket is final.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Tickets',
                      detail: 'Reserved NT$1,330 each (non-reserved NT$1,290, cars 10–12); scan at gate or collect.'
                    },
                    {
                      label: 'Board',
                      detail: 'Car and seat on ticket; platform shown at the gate.'
                    },
                    {
                      label: 'Get off',
                      detail: 'Taoyuan, not Taipei.'
                    },
                    {
                      label: 'Avoid',
                      detail: '0814 (9:25 AM): stopping train, arrives 11:18 AM.'
                    }
                  ]
                }
              },
              {
                time: '~11:17 AM – 11:36 AM',
                title: 'Taoyuan Airport MRT: THSR → TPE Terminal 1',
                titleTc: '桃園機場捷運：高鐵桃園站 A18 → 第一航廈 A12',
                icon: 'train',
                notes: '11:17 AM from A18 reaches T1 (A12) ~11:36 AM; Cathay counters close 12:20 PM. Commuter trains at :02, :17, :32, :47.',
                navigateTo: 'THSR Taoyuan Station (Metro Transfer), Zhongli District',
                guide: {
                  steps: [
                    {
                      label: 'Transfer',
                      detail: 'Follow Metro signs from THSR concourse to A18.'
                    },
                    {
                      label: 'Pay',
                      detail: 'Tap EasyCard or buy NT$35 token.'
                    },
                    {
                      label: 'Board',
                      detail: 'Commuter train; purple express skips A18 10:30 AM – ~5:00 PM.'
                    },
                    {
                      label: 'Get off',
                      detail: 'A12 Terminal 1, 19 min. On 0618 THSR: 10:47 AM train, arrives 11:06 AM.'
                    }
                  ]
                }
              },
              {
                time: '11:40 AM – 1:20 PM',
                title: 'Check-in, Airside Lunch, Gate',
                titleTc: '報到・管制區午餐・登機門',
                icon: 'plane',
                notes: 'Cathay T1 counters 10:20 AM – 12:20 PM; kiosks and bag drop close 12:10 PM.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Before',
                      detail: 'Check in online in Kaohsiung: bag drop only.'
                    },
                    {
                      label: 'Bag drop',
                      detail: 'Terminal 1, Counter 4 (Cathay); kiosks and bag drop at Counters 3/4.'
                    },
                    {
                      label: 'Security',
                      detail: 'Straight through security, passport control; airport homepage shows T1 waits.'
                    },
                    {
                      label: 'Lunch',
                      detail: '3F airside: Hómee RICE or Burger King (or Guiji, COMEME, Gontran Cherrier).'
                    }
                  ]
                }
              },
              {
                time: '1:20 PM – 3:25 PM',
                startAt: '2026-12-08T13:20:00+08:00',
                endAt: '2026-12-08T15:25:00+08:00',
                title: 'Cathay Pacific CX495: Taipei → Hong Kong',
                titleTc: '國泰航空 CX495：台北桃園 → 香港',
                icon: 'plane',
                notes: 'Economy, A330-300, meal served; TPE T1 → HKG T1. Boarding pass and live gate info final.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Gate',
                      detail: 'Check screens; it changes (Nov 11: B6).'
                    },
                    {
                      label: 'Early landing',
                      detail: 'Often lands 25–35 min early (2:45–3:05 PM); plan on 3:25 PM.'
                    },
                    {
                      label: 'On board',
                      detail: 'Eat the meal; passports handy for Immigration.'
                    }
                  ]
                }
              },
              {
                time: '3:25 PM – 4:15 PM',
                title: 'Touchdown Hong Kong (HKG T1) → Immigration → Bags',
                titleTc: '抵達香港國際機場・入境・行李',
                icon: 'plane-landing',
                notes: 'Immigration → Baggage Reclaim → Customs → Arrivals; visitors need only a valid travel document.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Immigration',
                      detail: 'Staffed visitor counters; e-Channel only for eligible frequent visitors.'
                    },
                    {
                      label: 'Customs',
                      detail: 'Collect bags; declare only dutiable goods above duty-free limits.'
                    },
                    {
                      label: 'Airport Express',
                      detail: 'In Arrivals, follow Airport Express signs to tickets and platform.'
                    }
                  ]
                }
              },
              {
                time: '~4:15 PM – 5:00 PM',
                title: 'Airport Express to Kowloon → Sasa Inn',
                titleTc: '機場快綫 → 九龍站 → 新月賓館',
                icon: 'train',
                notes: 'Group ticket for three: HK$210 total vs HK$105 each by Octopus. Single journey, valid day bought.',
                navigateTo: '香港九龍尖沙咀彌敦道87號華源大廈C座8字樓C1室',
                addressTc: '香港九龍尖沙咀彌敦道87號華源大廈C座8字樓C1室',
                guide: {
                  steps: [
                    {
                      label: 'Tickets',
                      detail: 'Buy group ticket (HK$210) at airport counter or machines in one purchase.'
                    },
                    {
                      label: 'Ride',
                      detail: 'Every ~10 min; get off at Kowloon, before Hong Kong Station.'
                    },
                    {
                      label: 'Taxi',
                      detail: 'Red taxi to 尖沙咀彌敦道87號華源大廈C座8字樓 (~5 min); bags HK$6 each.'
                    },
                    {
                      label: 'Check in',
                      detail: 'Flat C1, 8/F, Block C, Tsim Sha Tsui Mansion; tel 5125 0008; MTR exit C2.'
                    }
                  ]
                }
              },
              {
                time: '~5:15 PM – 6:15 PM',
                title: 'Tsim Sha Tsui Harbourfront Walk',
                titleTc: '尖沙咀海濱散步',
                icon: 'footprints',
                notes: 'A Symphony of Lights ended Nov 18, 2026; Winter Wonderland (7:00 PM) replaced it.',
                navigateTo: 'Tsim Sha Tsui Promenade, Hong Kong',
                addressTc: '香港尖沙咀海濱長廊',
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Nathan Road → Salisbury Road; cross to waterfront by Clock Tower.'
                    },
                    {
                      label: 'Avenue',
                      detail: 'East along Avenue of Stars: statues, handprints, Sports Wall of Fame.'
                    },
                    {
                      label: 'Dusk',
                      detail: 'Turn back to the Clock Tower at dusk.'
                    },
                    {
                      label: 'Leave by',
                      detail: '6:15 PM: MTR Tsim Sha Tsui → Jordan, Exit C2.'
                    }
                  ]
                }
              },
              {
                time: '~6:30 PM – 7:20 PM',
                title: 'Mak Man Kee Wonton Noodles — Jordan',
                titleTc: '麥文記麵家・佐敦',
                icon: 'utensils',
                notes: '51 Parkes Street, Jordan (MTR Jordan Exit C2); tel 2736 5561; daily 12:00 PM – 12:30 AM.',
                navigateTo: '香港佐敦白加士街51號',
                addressTc: '香港佐敦白加士街51號',
                guide: {
                  intro: 'Wonton noodles to open Hong Kong.',
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Shrimp wonton noodles, tossed noodles, dumplings; add beef brisket (牛腩).'
                    },
                    {
                      label: 'Protein',
                      detail: 'Plain bowl isn\'t 40 g: add brisket, roast meat, dumplings or second bowl.'
                    },
                    {
                      label: 'Still hungry',
                      detail: 'Kwun Chung Market or Bowring Street Market, short walk.'
                    },
                    {
                      label: 'Backup',
                      detail: 'Queue over 15 min: Shing Kee (盛記粥麵, 11 Parkes Street).'
                    }
                  ],
                  exit: 'Queue over 15 minutes: another noodle or roast-meat place nearby.'
                }
              },
              {
                time: '7:30 PM – 8:20 PM',
                title: 'Temple Street / Yau Ma Tei Night Walk',
                titleTc: '廟街・油麻地夜遊',
                icon: 'footprints',
                notes: 'No shopping. Temple Street (Jordan Road – Kansu Street) car-free 2:00 PM – midnight, busiest after dark.',
                navigateTo: '香港佐敦廟街',
                addressTc: '香港佐敦廟街',
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Archway near Jordan Road, north through the stalls to Kansu Street.'
                    },
                    {
                      label: 'Stops',
                      detail: 'Tin Hau Temple (Yau Ma Tei), Mido Cafe; fortune tellers and opera later.'
                    },
                    {
                      label: 'Snack',
                      detail: 'Spicy skewers, Turkish lamb or a dai pai dong seafood plate.'
                    },
                    {
                      label: 'Leave by',
                      detail: '8:20 PM: MTR Jordan or Yau Ma Tei → TST; walk to Cultural Centre.'
                    }
                  ]
                }
              },
              {
                time: '8:30 PM – 9:15 PM',
                title: 'Winter Wonderland in Tsim Sha Tsui',
                titleTc: '尖沙咀冬日奇幻',
                icon: 'sparkles',
                notes: 'Free; nightly 7:00–11:00 PM, Nov 18, 2026 – Jan 5, 2027; watch from the Cultural Centre waterfront.',
                navigateTo: '香港文化中心 觀景台',
                addressTc: '九龍尖沙咀梳士巴利道10號 香港文化中心',
                guide: {
                  steps: [
                    {
                      label: 'Where',
                      detail: 'Cultural Centre Viewing Deck, or outside Museum of Art / Space Museum.'
                    },
                    {
                      label: 'Leave',
                      detail: 'After one cycle; two only if the second starts straight away.'
                    }
                  ]
                }
              },
              {
                time: '9:15 PM – 11:15 PM',
                title: 'Promenade, Dessert or an Arcade',
                titleTc: '海濱・甜品・遊戲機中心',
                icon: 'gamepad-2',
                notes: 'Arcade hours from guides – check the door. Hotel by ~11:15–11:30 PM.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Silvercord',
                      detail: 'Shop B03, 30 Canton Road; 8:00 AM – 2:00 AM; Initial D, Taiko.'
                    },
                    {
                      label: 'Retrocity',
                      detail: 'LG23, Houston Centre, 63 Mody Road; 10:00 AM – 2:00 AM; non-smoking, maimai DX.'
                    },
                    {
                      label: 'Protein',
                      detail: 'Short? High-protein yogurt from PARKnSHOP or 7-Eleven.'
                    },
                    {
                      label: 'Back',
                      detail: 'Up Nathan Road to 87 Nathan Road.'
                    }
                  ]
                }
              }
            ],
            backups: {},
            foodRecommendation: 'Airside lunch at TPE → Mak Man Kee 麥文記麵家 (Jordan)',
            proteinHeadline: '25 g whey · food ~125 g',
            proteinPlan: '25 g whey at breakfast; airside lunch; Mak Man Kee: add brisket, roast meat or dumplings. Backup: PARKnSHOP high-protein yogurt.',
            insiderTip: '1:20 PM flight: early start, free Hong Kong evening. Kowloon Station → Sasa Inn by red taxi.'
          },
          {
            id: 'day-12',
            dayNum: '12',
            shortLabel: 'Peak / 山頂',
            city: 'Hong Kong / 香港',
            dateString: 'Wed, Dec 09, 2026',
            timeZone: 'Asia/Hong_Kong',
            title: 'Central → Peak & High West on Foot → Ho Hung Kee → Happy Valley IJC',
            titleTc: '中環・步行上山頂與西高山・何洪記・跑馬地國際騎師錦標賽',
            hotelRef: 'hk',
            transitSummary: 'Star Ferry → up the Peak on foot → taxi down → tram / walk → Happy Valley',
            weatherExpected: '~66°F • Mild; cool evening breeze',
            rainBackupAvailable: true,
            easyPlan: 'Shorten the Central loop or skip High West; keep Ho Hung Kee and the races.',
            rainPlan: 'Racing delayed or cancelled: Wan Chai / Causeway Bay, Central WinterFest, Observation Wheel, Star Ferry or TST arcade.',
            leaveByTime: '8:30 AM from hotel',
            timeline: [
              {
                time: '8:30 AM – 9:00 AM',
                title: 'Star Ferry: Tsim Sha Tsui → Central',
                titleTc: '天星小輪：尖沙咀 → 中環',
                icon: 'ship',
                notes: 'Weekdays HK$5.0 upper deck, HK$4.0 lower; boats every 6 minutes until ~9:45 AM.',
                navigateTo: '尖沙咀天星碼頭',
                addressTc: '九龍尖沙咀梳士巴利道 尖沙咀天星碼頭',
                guide: {
                  steps: [
                    {
                      label: 'Breakfast',
                      detail: 'Fairwood (大快活), 1/F Imperial Hotel, 32–34 Nathan Road; opens 7:00 AM.'
                    },
                    {
                      label: 'Order',
                      detail: 'Eggs and ham or pork-chop set; 25 g whey.'
                    },
                    {
                      label: 'Walk',
                      detail: 'Nathan Road → Salisbury Road, pier beside the Clock Tower.'
                    },
                    {
                      label: 'Pay',
                      detail: 'Octopus at upper-deck gate (HK$5.0); cash gets change; machines take cards, Alipay, WeChat Pay.'
                    }
                  ]
                }
              },
              {
                time: '9:00 AM – 9:45 AM',
                title: 'Central / Sheung Wan Compact Urban Route',
                titleTc: '中環・上環街區步行',
                icon: 'footprints',
                notes: 'No museums or shopping. Ends on Robinson Road, where the Peak climb starts.',
                navigateTo: '上環街市 皇后大道中345號',
                addressTc: '香港上環皇后大道中345號 上環市政大廈',
                guide: {
                  steps: [
                    {
                      label: 'Sheung Wan',
                      detail: 'Des Voeux Road Central west to Wing Lok Street, Bonham Strand West dried-seafood shops.'
                    },
                    {
                      label: 'Wet market',
                      detail: 'Sheung Wan Market (上環街市), 345 Queen\'s Road Central; ground and first floors.'
                    },
                    {
                      label: 'Hollywood Road',
                      detail: 'East past Man Mo Temple; stairs beside the escalator (downhill until 10:00 AM).'
                    },
                    {
                      label: 'Leave by',
                      detail: '9:45 AM at Robinson Road; east to Old Peak Road by Canossa Hospital.'
                    }
                  ]
                }
              },
              {
                time: '9:45 AM – 12:45 PM',
                title: 'Climb to the Peak → Lugard Road → High West',
                titleTc: '步行上山頂 → 盧吉道 → 西高山',
                icon: 'mountain',
                notes: 'On foot, not the Peak Tram. Bring water: food and drink only at Peak Tower, Peak Galleria, Victoria Peak Garden kiosk.',
                navigateTo: '舊山頂道 嘉諾撒醫院',
                addressTc: '香港中半山舊山頂道1號（羅便臣道交界）',
                guide: {
                  intro: 'The Peak earned on foot.',
                  steps: [
                    {
                      label: 'Weather',
                      detail: 'Check HKO Hiking Trail Weather Service; cloud on the Peak: skip High West.'
                    },
                    {
                      label: 'Climb',
                      detail: 'Old Peak Road, steep but paved, Robinson Road junction to Victoria Gap.'
                    },
                    {
                      label: 'Lugard Road',
                      detail: 'Buy water at Peak Tower; flat road, ~20 min to Lugard Road Lookout.'
                    },
                    {
                      label: 'High West',
                      detail: 'Stairs up where Lugard meets Harlech Road; back via Harlech Road to Peak Tower.'
                    }
                  ],
                  exit: 'Taxi down from the Peak around 12:45 PM.'
                }
              },
              {
                time: '~12:45 PM – 1:15 PM',
                title: 'Taxi Down to Wan Chai',
                titleTc: '計程車下山往銅鑼灣',
                icon: 'car',
                notes: 'Red urban taxi: HK$29 first 2 km, then HK$2.1 per 200 m.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Pickup',
                      detail: 'Beside Peak Tower / Peak Galleria; ask for 再興燒臘飯店, 軒尼詩道265號.'
                    },
                    {
                      label: 'Pay',
                      detail: 'Small notes – drivers needn\'t change HK$500 or HK$1,000; ask for receipt.'
                    },
                    {
                      label: 'Fallback',
                      detail: 'Bus 15 or green minibus 1 to Central, then Island Line to Wan Chai.'
                    }
                  ]
                }
              },
              {
                time: '1:15 PM – 2:10 PM',
                title: 'Joy Hing Roast Meats — Siu Mei Lunch',
                titleTc: '再興燒臘飯店・燒味',
                icon: 'utensils',
                notes: '再興燒臘飯店, Unit C, G/F, 265–267 Hennessy Road, Wan Chai; Mon–Sat ~10:00 AM – 10:00 PM, closed Sundays.',
                navigateTo: '再興燒臘飯店 軒尼詩道265號',
                addressTc: '香港灣仔軒尼詩道265-267號地下C座',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Rice plate each: char siu (叉燒) + roast pork (燒肉) or goose/duck (燒鵝/燒鴨).'
                    },
                    {
                      label: 'Backup',
                      detail: 'Queue over 15 min: walk 10 min east to Ho Hung Kee, 12/F Hysan Place.'
                    },
                    {
                      label: 'Backup order',
                      detail: 'Wonton noodles, dry-fried beef ho fun; open 11:00 AM – 10:00 PM.'
                    },
                    {
                      label: 'Leave by',
                      detail: '2:10 PM, east toward Causeway Bay and Happy Valley.'
                    }
                  ]
                }
              },
              {
                time: '2:15 PM – 3:15 PM',
                title: 'Causeway Bay → Happy Valley on Foot and by Tram',
                titleTc: '銅鑼灣 → 跑馬地（步行・電車）',
                icon: 'tram-front',
                notes: 'No shopping; coffee if needed. Tram HK$3.30 flat fare, paid as you get off.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Tram',
                      detail: 'Eastbound on Hennessy Road, \'Happy Valley\' route 2 or 5; upper-deck front.'
                    },
                    {
                      label: 'Pay',
                      detail: 'Front door on exit: Octopus, contactless card or phone; no change.'
                    },
                    {
                      label: 'Ride',
                      detail: 'To Happy Valley terminus on Wong Nai Chung Road.'
                    },
                    {
                      label: 'Walk',
                      detail: 'Racecourse side of Wong Nai Chung Road; coffee just off it.'
                    }
                  ]
                }
              },
              {
                time: '3:15 PM – 5:30 PM',
                title: 'Flexible Until Your Racing Window',
                titleTc: '彈性時間（等賽馬）',
                icon: 'clock',
                notes: 'First race 6:40 or 7:10 PM per race card; gates open 2 hours before (earlier tonight).',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Pick races',
                      detail: 'HKJC race card: choose 3–4 races including some IJC designated races.'
                    },
                    {
                      label: 'Wan Chai',
                      detail: 'Tai Yuen Street and Cross Street markets, or a café.'
                    },
                    {
                      label: 'Snack',
                      detail: 'Protein snack now; dinner after the races.'
                    },
                    {
                      label: 'Head over',
                      detail: 'Wong Nai Chung Road southbound closes 1.5 hours before race 1: walk or tram.'
                    }
                  ]
                }
              },
              {
                time: '~6:00 PM – 9:00 PM',
                title: 'Happy Valley — International Jockeys\' Championship',
                titleTc: '跑馬地馬場・國際騎師錦標賽',
                icon: 'trophy',
                notes: 'Dec 9: nine races, last ~11:00 PM. Public enclosure free for visitors 18+ with valid travel documents – bring passports.',
                navigateTo: '香港跑馬地黃泥涌道',
                addressTc: '香港跑馬地黃泥涌道',
                guide: {
                  intro: 'Part of Hong Kong International Races week.',
                  steps: [
                    {
                      label: 'Timing',
                      detail: 'Arrive 30–45 min before your window; stay 2–2.5 hours, 3 max.'
                    },
                    {
                      label: 'Entry',
                      detail: 'Public Enclosure, Wong Nai Chung Road; no under-18s, slippers, flip-flops or plastic footwear.'
                    },
                    {
                      label: 'Watch',
                      detail: 'Parade Ring before a race, then Winning Post; 2/F Track View Terrace big screen.'
                    },
                    {
                      label: 'Food',
                      detail: 'Beer Garden food trucks; live bands on centre stage.'
                    }
                  ],
                  recheck: 'When HKJC publishes the race card: check first-race time, adjust arrival.'
                }
              },
              {
                time: '~9:00 PM – 10:00 PM',
                title: 'Dinner in Wan Chai / Causeway Bay',
                titleTc: '灣仔／銅鑼灣晚餐',
                icon: 'utensils',
                notes: 'Nothing booked; eat on the way out. Racing ran late: skip the TST extra.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Roast-meat rice (char siu, roast pork or soy chicken), or pork chop with egg.'
                    },
                    {
                      label: 'Where',
                      detail: 'Wong Nai Chung Road toward Causeway Bay; eat near the MTR.'
                    },
                    {
                      label: 'At track',
                      detail: 'Or Beer Garden food trucks before leaving.'
                    }
                  ]
                }
              },
              {
                time: '~10:00 PM – 10:30 PM',
                title: 'Back to TST',
                titleTc: '返回尖沙咀',
                icon: 'train',
                notes: 'MTR is simplest; taxi adds Cross-Harbour Tunnel charge (HK$25 toll + HK$25 return toll).',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'MTR',
                      detail: 'Causeway Bay → Admiralty (Island Line), Tsuen Wan Line to TST, Exit C2.'
                    },
                    {
                      label: 'Ferry',
                      detail: 'Star Ferry Central → TST until 11:30 PM.'
                    },
                    {
                      label: 'Taxi',
                      detail: 'Sung Tak Street stand shut 5:00–11:59 PM; use Wong Nai Chung Road (race 3–second-last).'
                    }
                  ]
                }
              },
              {
                time: '10:30 PM – 11:30 PM',
                title: 'Late Arcade / Dessert in TST',
                titleTc: '尖沙咀遊戲機中心・甜品',
                icon: 'gamepad-2',
                notes: 'Only if races don\'t run late; after the final race (~11:00 PM), quick dessert near the hotel.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Arcade',
                      detail: 'Silvercord (B03, 30 Canton Road) or Retrocity (LG23, Houston Centre, 63 Mody Road).'
                    },
                    {
                      label: 'Hours',
                      detail: 'Listed to 2:00 AM; Dec 9 unverified – check the door.'
                    },
                    {
                      label: 'Dessert',
                      detail: 'High-protein yogurt from 7-Eleven or PARKnSHOP on the way back.'
                    }
                  ]
                }
              }
            ],
            backups: {},
            foodRecommendation: 'Breakfast before 8:30 AM → Joy Hing roast meats (再興燒臘), Wan Chai → late food after the races',
            proteinHeadline: '25 g whey · food ~125 g',
            proteinPlan: '25 g whey at breakfast; Joy Hing char siu, roast pork or goose; meaty dinner after the races.',
            insiderTip: 'Happy Valley public enclosure free for overseas visitors with travel documents; lunch Joy Hing, backup Ho Hung Kee.'
          },
          {
            id: 'day-13',
            dayNum: '13',
            shortLabel: 'WTT / 啟德',
            city: 'Hong Kong / 香港',
            dateString: 'Thu, Dec 10, 2026',
            timeZone: 'Asia/Hong_Kong',
            title: 'Lion Rock → Walled City Film Sets → Kai Tak → JOYPOLIS → WTT Finals',
            titleTc: '獅子山・九龍城寨電影場景・啟德・JOYPOLIS・WTT總決賽',
            hotelRef: 'hk',
            transitSummary: 'Taxi / MTR to Lion Rock → walk to Kowloon City → walk to Kai Tak → back to TST',
            weatherExpected: '~68°F • Mild; Lion Rock is exposed',
            rainBackupAvailable: true,
            easyPlan: 'Priority: WTT > Lion Rock > lunch + Kai Tak walk > Walled City; JOYPOLIS backup only.',
            rainPlan: 'Skip Lion Rock; do Walled City, longer JOYPOLIS, Kai Tak Sports Park, WTT.',
            leaveByTime: '7:45 AM from hotel',
            timeline: [
              {
                time: '7:45 AM – 8:30 AM',
                title: 'Taxi / MTR to the Lion Rock Approach',
                titleTc: '計程車／港鐵前往獅子山',
                icon: 'car',
                notes: 'Lion Pavilion (獅子亭), Sha Tin Pass Road, MacLehose Section 5 start, by ~8:30 AM. Red taxi: HK$29 first 2 km, then HK$2.1 per 200 m.',
                navigateTo: '沙田坳道 獅子山郊野公園',
                addressTc: '九龍黃大仙沙田坳道（獅子山郊野公園入口）',
                guide: {
                  steps: [
                    {
                      label: 'Before 7:45',
                      detail: 'Breakfast + 25 g whey; carry 1–1.5 litres water each – none on trail.'
                    },
                    {
                      label: 'Taxi',
                      detail: 'Nathan Road red taxi: 沙田坳道 獅子亭. HK$500/1,000 may be refused; get printed receipt.'
                    },
                    {
                      label: 'MTR fallback',
                      detail: 'East TST, Tuen Ma Line towards Wu Kai Sha to Diamond Hill; taxi up.'
                    },
                    {
                      label: 'Last top-up',
                      detail: 'Cold drinks at Sha Tin Pass village store – last resupply.'
                    }
                  ]
                }
              },
              {
                time: '~8:30 AM – 11:00 AM',
                title: 'Lion Rock Hike',
                titleTc: '獅子山健行',
                icon: 'mountain',
                notes: '~2.5-hour hike, steep in places. Free, no gate, no lighting – daylight only.',
                navigateTo: '沙田坳道 獅子山郊野公園',
                addressTc: '九龍黃大仙沙田坳道（獅子山郊野公園入口）',
                guide: {
                  steps: [
                    {
                      label: 'Climb',
                      detail: 'From Lion Pavilion, MacLehose Section 5 west to the ridge: ~1.5–2 km.'
                    },
                    {
                      label: 'Lion\'s head',
                      detail: 'Last 50–70 m is a scramble – stow poles. Wet or windy: stop at ridge.'
                    },
                    {
                      label: 'Descend',
                      detail: 'Stone trail from Lion Rock Pass towards Wang Tau Hom / Wong Tai Sin.'
                    },
                    {
                      label: 'Timing',
                      detail: 'Summit ~10 min; off trail by ~11:00 AM. Emergency: 999/112, quote distance post (M0xx).'
                    }
                  ]
                },
                exitTo: '黃大仙站'
              },
              {
                time: '~11:15 AM – 11:30 AM',
                title: 'Finish Wang Tau Hom / Tsz Wan Shan Side → Taxi to Kowloon Walled City Park',
                titleTc: '於橫頭磡／慈雲山一側下山 → 計程車往九龍寨城公園',
                icon: 'car',
                notes: 'Descend via Wang Tau Hom, Lion Rock Park or Tsz Wan Shan; taxi 15–20 min to Kowloon Walled City Park (九龍寨城公園).',
                navigateTo: '九龍寨城公園',
                addressTc: '九龍九龍城東正道 九龍寨城公園',
                guide: {
                  steps: [
                    {
                      label: 'Exit D3',
                      detail: 'Wong Tai Sin (Ching Tak Street) 8–12 min from path end; buy water nearby.'
                    },
                    {
                      label: 'Taxi',
                      detail: 'Red taxi to 九龍寨城公園, Tung Tsing Road (東正道); meter from HK$29.'
                    },
                    {
                      label: 'MTR fallback',
                      detail: 'Kwun Tong Line → Diamond Hill; Tuen Ma Line → Sung Wong Toi, Exit B3, ~8 min.'
                    }
                  ]
                }
              },
              {
                time: '11:30 AM – 12:15 PM',
                title: 'Kowloon Walled City: A Cinematic Journey (If a Slot Is Free)',
                titleTc: '「九龍城寨光影之旅」電影場景展',
                icon: 'clapperboard',
                notes: 'Free film-set exhibition 「九龍城寨光影之旅」, restored Qing Yamen; 9:00 AM – 7:00 PM. Same-day counter tickets only; 45 min max; skip if 15–20 min idle.',
                navigateTo: '九龍寨城公園',
                addressTc: '九龍九龍城東正道 九龍寨城公園',
                guide: {
                  intro: 'Reconstructed sets from Twilight of the Warriors: Walled In, on the original site.',
                  steps: [
                    {
                      label: 'Tickets',
                      detail: 'Yamen counter from 8:45 AM / 1:45 PM; two per person, so two queue.'
                    },
                    {
                      label: 'Decide',
                      detail: 'Slot by ~12:30 PM: go. Later: lunch.'
                    },
                    {
                      label: 'Second try',
                      detail: '1:45 PM, still nearby, WTT safe: one try for 2:00–7:00 PM sessions.'
                    },
                    {
                      label: 'On time',
                      detail: 'Enter at printed time; late tickets void, go to standby.'
                    }
                  ],
                  exit: 'Weekdays 9 AM – noon: 25-min sessions; else 15-min. Max 60 inside.'
                },
                live: {
                  label: 'Ticket rules',
                  url: 'https://fpf.ccidahk.gov.hk/en/kwc/index.html'
                }
              },
              {
                time: '12:20 PM – 1:05 PM',
                title: 'Kowloon City Lunch — Islam Food',
                titleTc: '九龍城午餐',
                icon: 'utensils',
                notes: 'Islam Food (清真牛肉館), G/F, 33–35 Tak Ku Ling Road; ~11:00 AM – 10:00 PM; tel 2382 1882. Halal; day\'s big meat meal.',
                navigateTo: '清真牛肉館 打鼓嶺道33號',
                addressTc: '九龍九龍城打鼓嶺道33-35號 清真牛肉館',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Share pan-fried beef cakes (牛肉餅); then curry mutton (咖喱羊腩) or brisket vermicelli (牛腩粉絲) each.'
                    },
                    {
                      label: 'Backup',
                      detail: 'Thai House (South Wall Road) boat noodles, or Kowloon City Market cooked food centre.'
                    },
                    {
                      label: 'After WTT',
                      detail: 'Fong Wing Kee (方榮記), 85–87 Hau Wong Road; ~11:30 AM – 12:30 AM; satay beef hotpot.'
                    }
                  ]
                }
              },
              {
                time: '1:10 PM – 2:00 PM',
                title: 'Walk East: Sung Wong Toi → Kai Tak Waterfront → Sports Park',
                titleTc: '向東步行：宋王臺 → 啟德海濱 → 啟德體育園',
                icon: 'footprints',
                notes: 'Walk from Kowloon City past Sung Wong Toi rock and station display to Kai Tak Sports Park (38 Shing Kai Road).',
                navigateTo: '啟德體藝館',
                addressTc: '九龍啟德承啟道38號 啟德體育園',
                guide: {
                  steps: [
                    {
                      label: 'Rock',
                      detail: 'Start at Sung Wong Toi Garden.'
                    },
                    {
                      label: 'Station display',
                      detail: 'Sung Wong Toi MTR concourse (Exit D side): \'Treasures from Sacred Hill\'. Free.'
                    },
                    {
                      label: 'To park',
                      detail: 'East ~10 min from Sung Wong Toi station; pin garden, display, park separately.'
                    },
                    {
                      label: 'Rain',
                      detail: 'Raining? Cut the walk; wait in Kai Tak Mall.'
                    }
                  ]
                }
              },
              {
                time: '2:15 PM – 3:15 PM',
                title: 'Kai Tak Buffer — JOYPOLIS SPORTS (Backup Only)',
                titleTc: 'JOYPOLIS SPORTS 香港（可選）',
                icon: 'gamepad-2',
                notes: 'Backup only: if early, WTT timing safe, all three keen. HK$180 (≈ US$23) for 60 min, regular days, age 12+; peak 120 min, HK$360.',
                navigateTo: 'JOYPOLIS SPORTS Hong Kong 啟德體育園',
                addressTc: '九龍啟德承啟道38號 啟德體育園（Health and Wellness Centre）',
                guide: {
                  steps: [
                    {
                      label: 'Buy there',
                      detail: 'Don\'t pre-buy; JPS Pass 60-min, counter/online; confirm Regular day. 3/F only after 6:30 PM.'
                    },
                    {
                      label: 'Get there',
                      detail: 'Health and Wellness Centre, G/F–4/F; Sung Wong Toi or Kai Tak Exit D, 10 min.'
                    },
                    {
                      label: 'Arrive',
                      detail: '20 min early for wristbands; grip socks HK$30 a pair.'
                    },
                    {
                      label: 'Leave by',
                      detail: '3:15 PM for early dinner; skip the 4/F restaurant.'
                    }
                  ]
                }
              },
              {
                time: '3:20 PM – 4:10 PM',
                title: 'Early Dinner at Kai Tak',
                titleTc: '啟德早晚餐',
                icon: 'utensils',
                notes: 'Insurance only – snack will do after big lunch. Kai Tak Mall 1–3 adjoins the Arena; eat by ~5:15 PM for 6:00 PM start.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Cantonese',
                      detail: 'Ming Garden (M2-310, 3/F Mall 2): char siu, suckling pig, dim sum.'
                    },
                    {
                      label: 'Beef',
                      detail: 'So Gor Beef Brisket (M3-107, 1/F Mall 3): brisket, tendon noodles; or Gyu-Kaku J (M2-301).'
                    },
                    {
                      label: 'Fastest',
                      detail: 'Food Gala (2/F Mall 1; Pepper Lunch Express, JMT Korean) or N+ Burger (M2-102).'
                    },
                    {
                      label: 'Arena snack',
                      detail: 'Bags screened; check park prohibited items before buying a protein bar.'
                    }
                  ]
                }
              },
              {
                time: '6:00 PM – 9:30 PM',
                title: 'WTT Finals Hong Kong — Kai Tak Arena (Ticketed Session)',
                titleTc: 'WTT 世界乒乓球職業大聯盟總決賽・啟德體藝館',
                icon: 'trophy',
                notes: 'Unofficial: Thursday Session 04 at 6:00 PM (Session 03 noon); keep ~5:00 PM onward free. CAT 2 HK$680 + HK$35 booking fee each.',
                navigateTo: '啟德體藝館',
                addressTc: '九龍啟德承啟道38號 啟德體育園',
                guide: {
                  intro: 'The world\'s top-ranked table-tennis players, Dec 9–13.',
                  steps: [
                    {
                      label: 'Seats',
                      detail: 'Central sideline beats category: central CAT 3 > CAT 2 corner. No courtside.'
                    },
                    {
                      label: 'Route',
                      detail: 'Arena, not Stadium. Tuen Ma Line: Kai Tak/Sung Wong Toi Exit D, 5–10 min.'
                    },
                    {
                      label: 'Enter',
                      detail: 'At the door by 5:15 PM (~45 min early); bags screened at park entrance.'
                    },
                    {
                      label: 'Times shift',
                      detail: 'Slide JOYPOLIS and dinner around it. End unpublished; plan ~9:30 PM.'
                    }
                  ],
                  recheck: 'Enter ~45 min before ticket time; slide JOYPOLIS and dinner to fit.'
                },
                live: {
                  label: 'Event & tickets',
                  url: 'https://www.kaitaksportspark.com.hk/events-tickets/wtt-finals-hong-kong-2026'
                }
              },
              {
                time: '~9:30 PM – 10:15 PM',
                title: 'Late Dinner → Back to TST',
                titleTc: '宵夜 → 返回尖沙咀',
                icon: 'utensils',
                notes: 'After the session, MTR beats taxi: pick-up zones change, queues build.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'On site',
                      detail: 'Kai Tak Mall: So Gor brisket noodles, quickest protein, if still serving.'
                    },
                    {
                      label: 'Kowloon City',
                      detail: 'Taxi to Thai quarter (Lung Kong Road): boat noodles or grilled pork neck; taxi home.'
                    },
                    {
                      label: 'MTR home',
                      detail: 'Kai Tak/calmer Sung Wong Toi Exit D; Tuen Ma Line towards Tuen Mun, East TST.'
                    },
                    {
                      label: 'Protein',
                      detail: 'Food fell short? 25 g whey at the hotel.'
                    }
                  ]
                }
              },
              {
                time: '10:30 PM – 11:30 PM',
                title: 'TST Arcade / Dessert (If Still Awake)',
                titleTc: '尖沙咀遊戲機中心・甜品',
                icon: 'gamepad-2',
                notes: 'Optional, if all awake; Sasa Inn by ~11:30 PM. Hours unverified – check a map app.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Kowloon City',
                      detail: 'Chiu Chow Hop Shing Dessert (9 Lung Kong Road): black sesame dumplings.'
                    },
                    {
                      label: 'Sweet soup',
                      detail: 'Tei Mou Koon (G/F, 47 Fuk Lo Tsun Road): walnut, black sesame, almond, lotus seed.'
                    },
                    {
                      label: 'TST arcade',
                      detail: 'Search 遊戲機中心 尖沙咀; nearest open; 30–45 min.'
                    },
                    {
                      label: 'Cut-off',
                      detail: 'Stop by 11:30 PM – 7:00 AM start tomorrow for Lantau Peak.'
                    }
                  ]
                }
              }
            ],
            backups: {},
            foodRecommendation: 'Breakfast before 7:45 AM → Kowloon City lunch (Thai / Chiu Chow / Cantonese) → dinner after WTT',
            proteinHeadline: '50 g whey · food ~100 g',
            proteinPlan: 'Whey: 25 g breakfast, 25 g post-WTT if short. Big Kowloon City lunch, early Kai Tak dinner, arena snack.',
            insiderTip: 'Paid: WTT CAT 2 ~US$87–92 with fees; JOYPOLIS ~US$23 only if used.'
          },
          {
            id: 'day-14',
            dayNum: '14',
            shortLabel: 'Lantau / 大嶼山',
            city: 'Hong Kong / 香港',
            dateString: 'Fri, Dec 11, 2026',
            timeZone: 'Asia/Hong_Kong',
            title: 'Lantau Peak → Big Buddha → Tai O → Central WinterFest → Observation Wheel → TST',
            titleTc: '鳳凰山・天壇大佛・大澳・中環冬日奇幻・摩天輪・尖沙咀',
            hotelRef: 'hk',
            transitSummary: 'MTR Tung Chung → taxi Pak Kung Au → hike → Bus 21 (1:20 PM) → Bus 11 (3:45 PM) → MTR Central → Star Ferry',
            weatherExpected: '~66°F • Mountain & coastal breeze',
            rainBackupAvailable: true,
            easyPlan: 'Legs done after the summit? Short Big Buddha, shorter Tai O loop.',
            rainPlan: 'No hike: Tung Chung → Ngong Ping 360/bus → Big Buddha → Tai O; then Central, WinterFest, Wheel, TST, arcade.',
            leaveByTime: '7:15 AM from TST',
            timeline: [
              {
                time: '7:15 AM – 8:05 AM',
                title: 'MTR: TST → Tung Chung',
                titleTc: '港鐵：尖沙咀 → 東涌',
                icon: 'train',
                notes: '~50 min by MTR.',
                navigateTo: 'Tung Chung MTR Station, Lantau Island',
                guide: {
                  steps: [
                    {
                      label: 'Before 7:00',
                      detail: 'Big breakfast + 25 g whey. Pack windbreaker, dry food, water.'
                    },
                    {
                      label: 'Route',
                      detail: 'Tsuen Wan Line (red) to Lai King; change to Tung Chung Line (orange).'
                    },
                    {
                      label: 'Pay',
                      detail: 'Top up Octopus: NLB buses take it, lower weekday fares (Friday counts).'
                    },
                    {
                      label: 'Buses',
                      detail: 'NLB from Tung Chung Station Bus Terminus, Tat Tung Road, beside the station.'
                    }
                  ]
                }
              },
              {
                time: '~8:15 AM – 8:35 AM',
                title: 'Taxi to Pak Kung Au',
                titleTc: '巴士／計程車往伯公坳',
                icon: 'bus',
                notes: 'Taxi keeps the day on time for the 1:20 PM Tai O bus. Pak Kung Au (伯公坳), Tung Chung Road: Lantau Trail Stage 3 start.',
                navigateTo: '伯公坳 巴士站',
                addressTc: '大嶼山東涌道 伯公坳巴士站',
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'Blue Lantau taxi from station (red barred): 東涌道 伯公坳 (Pak Kung Au bus stop).'
                    },
                    {
                      label: 'Bus fallback',
                      detail: 'NLB 11, 15th stop: 7:50, 8:00, 8:15, 8:30, 8:45 AM; HK$14.0 Octopus. NLB 23 too.'
                    },
                    {
                      label: 'Get off',
                      detail: 'Right after Tung Chung Au Management Centre; 8:15/8:30 AM detour is beyond it.'
                    }
                  ]
                }
              },
              {
                time: '~8:45 AM – 11:30 AM',
                title: 'Lantau Peak: Pak Kung Au → Summit → Ngong Ping',
                titleTc: '鳳凰山：伯公坳 → 山頂 → 昂坪',
                icon: 'mountain',
                notes: 'Lantau Trail Stage 3: ~4.5 km, ~600 m up, ~2.5 hours; allow ~2h45 with photos. Season: October–April.',
                navigateTo: '伯公坳 巴士站',
                addressTc: '大嶼山東涌道 伯公坳巴士站',
                guide: {
                  intro: 'Not a casual paved lookout.',
                  steps: [
                    {
                      label: 'Weather veto',
                      detail: 'Check rain, cloud, wind. Fails? Ngong Ping 360 from Tung Chung (buy on day).'
                    },
                    {
                      label: 'Up',
                      detail: 'Stage 3 signs, steep stone steps. Avoid Kau Nga Ling \'Dog Teeth\' routes.'
                    },
                    {
                      label: 'Summit',
                      detail: 'Windbreaker on – windy in winter.'
                    },
                    {
                      label: 'Down',
                      detail: 'Far side to Ngong Ping and the Big Buddha by ~11:00 AM.'
                    }
                  ],
                  recheck: 'Morning of: rain, cloud, wind. Fails → Ngong Ping 360 instead.'
                },
                exitTo: '香港大嶼山昂坪寶蓮禪寺'
              },
              {
                time: '11:40 AM – 12:05 PM',
                title: 'Big Buddha (20 min)',
                titleTc: '天壇大佛',
                icon: 'landmark',
                notes: 'Steps, view, done. Buddha 10:00 AM – 5:30 PM; Po Lin Monastery 9:00 AM – 6:00 PM.',
                navigateTo: '香港大嶼山昂坪寶蓮禪寺',
                addressTc: '香港大嶼山昂坪寶蓮禪寺',
                guide: {
                  steps: [
                    {
                      label: 'Climb',
                      detail: 'Stone steps to the platform; circle once, then down.'
                    },
                    {
                      label: 'Skip',
                      detail: 'Base halls and the \'Thus Come Thus Gone\' exhibition.'
                    },
                    {
                      label: 'Then',
                      detail: 'Walk down to Ngong Ping Village for lunch.'
                    }
                  ]
                }
              },
              {
                time: '12:10 PM – 12:55 PM',
                title: 'Quick Lunch at Ngong Ping',
                titleTc: '昂坪午餐',
                icon: 'utensils',
                notes: 'Eat fast; at the stop for the 1:20 PM bus. Ngong Ping Village for meat; Po Lin Vegetarian Kitchen (11:30 AM – 4:30 PM) is meat-free.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Protein',
                      detail: 'Hong Kong-style outlet: char siu or roast-meat rice, or beef brisket noodles.'
                    },
                    {
                      label: 'Monastery',
                      detail: 'Po Lin set (left of Main Shrine Hall): low protein; add whey or snack later.'
                    },
                    {
                      label: 'Sweet',
                      detail: 'Shop beside the Vegetarian Kitchen: bean curd dessert (豆腐花), mango glutinous rice dumplings.'
                    },
                    {
                      label: 'Leave by',
                      detail: '12:55 PM to Ngong Ping bus terminus, Po Ngong Road.'
                    }
                  ]
                }
              },
              {
                time: '1:20 PM – 1:40 PM',
                title: 'Bus 21: Ngong Ping → Tai O (1:20 PM)',
                titleTc: '新大嶼山巴士21號：昂坪 → 大澳（13:20）',
                icon: 'bus',
                notes: 'NLB 21 from Ngong Ping: 11:20 AM, 12:20 PM, 1:20 PM, 2:20 PM (Mon–Sat); ~18 min; weekday HK$7.9.',
                navigateTo: 'Ngong Ping Bus Terminus, Lantau Island',
                guide: {
                  steps: [
                    {
                      label: 'Board',
                      detail: 'Ngong Ping terminus, Po Ngong Road; tap Octopus.'
                    },
                    {
                      label: 'Get off',
                      detail: 'Tai O, last stop; walk into the village.'
                    }
                  ]
                }
              },
              {
                time: '1:40 PM – 3:35 PM',
                title: 'Tai O — Stilt Houses, Waterfront, Food, Short Sampan',
                titleTc: '大澳・棚屋・海濱・小吃・小艇',
                icon: 'ship',
                notes: '~2 hours: market street, bridges, maybe a sampan, one snack. No 30-minute boat wait, no crafts.',
                navigateTo: '香港大嶼山大澳吉慶街66號',
                addressTc: '香港大嶼山大澳吉慶街66號',
                guide: {
                  steps: [
                    {
                      label: 'Walk',
                      detail: 'Tai O Market Street → Kat Hing Street (吉慶街); cross creek bridges for both banks.'
                    },
                    {
                      label: 'Snack',
                      detail: 'One: grilled squid, fish ball skewer or egg waffle (雞蛋仔).'
                    },
                    {
                      label: 'Boat',
                      detail: 'Sampan only if leaving now; agree price first (~US$6).'
                    },
                    {
                      label: 'Leave by',
                      detail: 'Bus 11 stop, Tai O Road, by 3:35 PM.'
                    }
                  ]
                }
              },
              {
                time: '3:45 PM – 4:37 PM',
                title: 'Bus 11: Tai O → Tung Chung (3:45 PM)',
                titleTc: '新大嶼山巴士11號：大澳 → 東涌（15:45）',
                icon: 'bus',
                notes: 'NLB 11 from Tai O: 3:30, 3:45, 4:00, 4:10, 4:25 PM (Mon–Sat); ~52 min to Tung Chung; weekday HK$14.0.',
                navigateTo: 'Tai O Bus Terminus, Lantau Island, Hong Kong',
                addressTc: '大澳巴士總站',
                guide: {
                  steps: [
                    {
                      label: 'Board',
                      detail: 'Tai O Road stop, 10 min early; tap Octopus.'
                    },
                    {
                      label: 'If missed',
                      detail: 'Every 10–15 min (4:00, 4:10 PM next) – don\'t run.'
                    }
                  ]
                }
              },
              {
                time: '~4:45 PM – 5:30 PM',
                title: 'MTR Tung Chung → Central',
                titleTc: '港鐵東涌 → 中環',
                icon: 'train',
                notes: 'Straight to Central, no hotel stop. Tung Chung Line (orange) to Hong Kong station, linked underground to Central.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Ride',
                      detail: 'Tap Octopus; towards Hong Kong, ~30 min.'
                    },
                    {
                      label: 'Walk',
                      detail: 'Underground link to Central; Exit K for Statue Square.'
                    }
                  ]
                }
              },
              {
                time: '5:45 PM – 6:50 PM',
                title: 'Dinner — Tai Ping Koon (Soy-Sauce Western)',
                titleTc: '太平館餐廳・豉油西餐',
                icon: 'utensils',
                notes: 'Tai Ping Koon (太平館餐廳), G/F, 60 Stanley Street, Central; 11:00 AM – 11:00 PM; tel 2899 2780. Soy-sauce Western (豉油西餐).',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Share Swiss-sauce wings (瑞士雞翼), dry-fried beef ho fun (乾炒牛河); hungry: roast pigeon, Portuguese chicken rice.'
                    },
                    {
                      label: 'Backup',
                      detail: 'Short on time: Kuen Kee Won Ton Noodle (權記雲吞麵, 2 Peel Street); hours unconfirmed.'
                    },
                    {
                      label: 'Leave by',
                      detail: '6:50 PM; ~10 min walk to Statue Square Gardens for 7:00 PM show.'
                    }
                  ]
                },
                navigateTo: '太平館餐廳 士丹利街60號',
                addressTc: '香港中環士丹利街60號地下'
              },
              {
                time: '7:00 PM – 7:40 PM',
                title: 'Winter Wonderland in Central',
                titleTc: '中環冬日奇幻',
                icon: 'sparkles',
                notes: 'Free Christmas Town, Statue Square Gardens; Fridays 4:00–11:30 PM. Light show every 30 min, 7–11 PM.',
                navigateTo: '皇后像廣場 中環',
                addressTc: '香港中環德輔道中 皇后像廣場',
                guide: {
                  steps: [
                    {
                      label: 'Enter',
                      detail: 'North and South Statue Square Gardens, Des Voeux Road Central; Central Exit K.'
                    },
                    {
                      label: 'Shows',
                      detail: 'Catch 7:00 PM; walk the town; 7:30 PM from another side.'
                    },
                    {
                      label: 'Leave by',
                      detail: '7:40 PM: ~10 min north to Observation Wheel, 33 Man Kwong Street.'
                    }
                  ]
                }
              },
              {
                time: '7:45 PM – 8:15 PM',
                title: 'Hong Kong Observation Wheel',
                titleTc: '香港摩天輪',
                icon: 'ferris-wheel',
                notes: 'Adult HK$20 (≈ US$2.60), ~15 min ride. Fridays to 11 PM (Mon–Thu 10 PM); last ride 10:30 PM.',
                navigateTo: '香港摩天輪',
                addressTc: '香港中環民光街33號',
                guide: {
                  steps: [
                    {
                      label: 'Ticket',
                      detail: 'Book online or buy there; skip queues over 15 min.'
                    },
                    {
                      label: 'Weather',
                      detail: 'Wind or rain: check the wheel\'s weather arrangements before queuing.'
                    }
                  ]
                }
              },
              {
                time: '~8:25 PM – 8:45 PM',
                title: 'Star Ferry → TST',
                titleTc: '天星小輪 → 尖沙咀',
                icon: 'ship',
                notes: 'Central Pier 7 → TST: Mon–Fri adult HK$5.0 upper, HK$4.0 lower; every 6–8 min to ~8:30 PM, then less often to 11:30 PM.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Pay',
                      detail: 'Octopus at upper-deck gate, or cash (HK$10/20 notes, coins; change given), card/QR at machines.'
                    },
                    {
                      label: 'On board',
                      detail: 'Upper deck; no eating or drinking.'
                    },
                    {
                      label: 'Arrive',
                      detail: 'From TST pier head east to the Cultural Centre.'
                    }
                  ]
                }
              },
              {
                time: '8:50 PM – 9:20 PM',
                title: 'TST Waterfront / WinterFest',
                titleTc: '尖沙咀海濱・冬日節',
                icon: 'footprints',
                notes: 'One cycle of free projection mapping on Cultural Centre, Museum of Art, Space Museum; 7–11 PM nightly. Full show tomorrow.',
                navigateTo: '香港文化中心 觀景台',
                addressTc: '九龍尖沙咀梳士巴利道10號 香港文化中心',
                guide: {
                  steps: [
                    {
                      label: 'Stand',
                      detail: 'Cultural Centre Viewing Deck, or outside Museum of Art or Space Museum.'
                    },
                    {
                      label: 'Watch',
                      detail: 'Next show (schedule may change), then move on.'
                    },
                    {
                      label: 'Next',
                      detail: 'Up to Nathan Road for the arcade by ~9:20 PM.'
                    }
                  ]
                }
              },
              {
                time: '9:20 PM – 10:30 PM',
                title: 'Arcade / Games',
                titleTc: '遊戲機中心',
                icon: 'gamepad-2',
                notes: 'No arcade verified – pick the nearest open one near Nathan Road.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Find one',
                      detail: 'Search 遊戲機中心 尖沙咀; walk to the closest open.'
                    },
                    {
                      label: 'Play',
                      detail: 'Head-to-head for three: racing, rhythm, fighting, claw machines.'
                    },
                    {
                      label: 'Pay',
                      detail: 'Check tokens, Octopus or game card before topping up; agree a spending cap.'
                    }
                  ]
                }
              },
              {
                time: '10:30 PM – 11:15 PM',
                title: 'Late Food / Dessert',
                titleTc: '宵夜・遊戲機中心',
                icon: 'gamepad-2',
                notes: 'Hotel ~11:15–11:30 PM. Pick: Kai Kai Dessert (G/F, 113–115 Parkes Street, Jordan); hours unpublished – check first.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Protein first',
                      detail: 'Light dinner? Beef brisket noodles or pork chop bun (豬扒包) near Nathan Road.'
                    },
                    {
                      label: 'Dessert',
                      detail: 'Kai Kai: MTR one stop to Jordan; save a different bowl for tomorrow.'
                    },
                    {
                      label: 'Order',
                      detail: 'Black sesame, almond, red bean with lotus seeds, or tofu skin with ginkgo.'
                    },
                    {
                      label: 'Back',
                      detail: 'Sasa Inn by ~11:30 PM; second 25 g whey.'
                    }
                  ]
                }
              }
            ],
            backups: {
              activity: {
                title: 'Weather veto: Ngong Ping 360',
                titleTc: '天氣備案：昂坪360',
                note: 'Cable car from Tung Chung to Ngong Ping, then the Big Buddha and Tai O as planned. Buy on the day.',
                navigateTo: '香港大嶼山東涌達東路11號'
              }
            },
            foodRecommendation: 'Breakfast before 7:00 AM → Ngong Ping lunch → Tai O snack → early Central dinner → late TST food',
            proteinHeadline: '50 g whey · food ~100 g',
            proteinPlan: '25 g before Lantau + 25 g hotel tonight; Ngong Ping lunch after summit, Central dinner before 7 PM show.',
            insiderTip: 'Hike: allow ~2h45 with photos; respect the weather veto. Paid: Tai O sampan ~US$6, Observation Wheel ~US$2.60.'
          },
          {
            id: 'day-15',
            dayNum: '15',
            shortLabel: 'Finale / 尾聲',
            city: 'Hong Kong / 香港',
            dateString: 'Sat, Dec 12, 2026',
            timeZone: 'Asia/Hong_Kong',
            title: 'Yat Tung Heen → Brands Expo → Causeway Bay Streets → Tram → Wan Chai → Aqua Luna → Final HK Night',
            titleTc: '逸東軒・工展會・銅鑼灣街頭・電車・灣仔・張保仔號・香港最後一晚',
            hotelRef: 'hk',
            transitSummary: 'MTR Causeway Bay → Ding Ding tram west to Wan Chai → Star Ferry Wan Chai → TST',
            weatherExpected: '~68°F • Mild evening conditions',
            rainBackupAvailable: true,
            easyPlan: 'Shorten the Brands Expo and tram; keep Yat Tung Heen and the 5:30 PM Aqua Luna.',
            rainPlan: 'Aqua Luna cancelled: Central / Wan Chai → Observation Wheel → Star Ferry → TST WinterFest → arcade.',
            leaveByTime: '9:45 AM for 10:00 brunch',
            timeline: [
              {
                time: '10:00 AM – 10:55 AM',
                title: 'Yat Tung Heen — Michelin-Star Dim Sum Brunch #2',
                titleTc: '逸東軒・米芝蓮一星點心',
                icon: 'utensils',
                notes: 'B2 Eaton HK, 380 Nathan Road, Jordan. Saturday 10:00 AM – 4:00 PM, 6:00–10:30 PM; ~US$30–40 each. Bill ~10:50 AM; out 11:00 AM.',
                navigateTo: '逸東軒 逸東酒店',
                addressTc: '九龍佐敦彌敦道380號香港逸東酒店地庫2樓',
                guide: {
                  intro: 'The second and final starred meal.',
                  steps: [
                    {
                      label: 'Book',
                      detail: '10:00 AM via SevenRooms (restaurant site) or +852 2710 1093; no Saturday dim sum deal.'
                    },
                    {
                      label: 'Get there',
                      detail: 'Leave 9:45 AM: Tsuen Wan Line one stop to Jordan, or ~20 min walk.'
                    },
                    {
                      label: 'Signatures',
                      detail: 'À la carte: honey-glazed char siu, Golden Fried Crispy Chicken Skin, roast suckling pig.'
                    },
                    {
                      label: 'Dim sum',
                      detail: 'Har gow (蝦餃), siu mai, steamed spare ribs, char siu buns; greens, rice or noodles.'
                    }
                  ]
                }
              },
              {
                time: '~11:00 AM – 11:20 AM',
                title: 'MTR to Causeway Bay',
                titleTc: '港鐵往銅鑼灣',
                icon: 'train',
                notes: 'Jordan → Causeway Bay: ~20 min, one change.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Tsuen Wan Line (red) to Admiralty; Island Line (blue) towards Chai Wan to Causeway Bay.'
                    },
                    {
                      label: 'Exit',
                      detail: 'Exit E; east along Great George Street to Victoria Park.'
                    }
                  ]
                }
              },
              {
                time: '11:30 AM – 12:30 PM',
                title: '60th Hong Kong Brands & Products Expo — Opening Day',
                titleTc: '第60屆工展會・開幕日',
                icon: 'store',
                notes: 'Victoria Park: 11:00 AM – 9:00 PM, HK$10. 50 min for food samples and oddities, not shopping.',
                navigateTo: '香港銅鑼灣高士威道 維多利亞公園',
                addressTc: '香港銅鑼灣高士威道 維多利亞公園',
                guide: {
                  steps: [
                    {
                      label: 'Entry',
                      detail: 'HK$10 at the gate. Queue over 15–20 min? Skip; start the Causeway Bay walk.'
                    },
                    {
                      label: 'Eat',
                      detail: 'Food Plaza, Hometown Flavors, Food & Beverages samples; beef jerky (牛肉乾), sausages.'
                    },
                    {
                      label: 'Look',
                      detail: 'Hong Kong Brands Square; skip Beauty & Healthcare, Living & Household.'
                    },
                    {
                      label: 'Leave by',
                      detail: '12:30 PM via Great George Street side.'
                    }
                  ]
                }
              },
              {
                time: '12:30 PM – 1:30 PM',
                title: 'Causeway Bay Streets — Jardine\'s Crescent',
                titleTc: '銅鑼灣街頭・渣甸坊',
                icon: 'footprints',
                notes: 'An hour from Victoria Park to the Jardine\'s Crescent market lane. No shopping.',
                navigateTo: '渣甸坊 銅鑼灣',
                addressTc: '香港銅鑼灣渣甸坊',
                guide: {
                  steps: [
                    {
                      label: 'Route',
                      detail: 'Great George Street exit into side streets behind the department stores.'
                    },
                    {
                      label: 'Lanes',
                      detail: 'Jardine\'s Crescent (渣甸坊) and Jardine\'s Bazaar: clothes, household goods, snacks.'
                    },
                    {
                      label: 'Snack',
                      detail: 'One street bite or cha chaan teng milk tea; dinner after the cruise.'
                    },
                    {
                      label: 'Next',
                      detail: '1:30 PM: westbound tram, Yee Wo Street / Hennessy Road.'
                    }
                  ]
                }
              },
              {
                time: '1:30 PM – 2:00 PM',
                title: 'Ding Ding Tram West → Wan Chai (20–30 min)',
                titleTc: '叮叮電車西行 → 灣仔／中環',
                icon: 'tram-front',
                notes: 'Adult flat fare HK$3.30, paid on exit.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Board',
                      detail: 'Any westbound tram (Kennedy Town, Shek Tong Tsui, Western Market), rear door.'
                    },
                    {
                      label: 'Sit',
                      detail: 'Upper deck, front seats.'
                    },
                    {
                      label: 'Pay',
                      detail: 'Octopus, contactless card or phone at front exit; cash in box, no change.'
                    },
                    {
                      label: 'Get off',
                      detail: 'Johnston Road, Wan Chai, at Tai Yuen Street (太原街).'
                    }
                  ]
                }
              },
              {
                time: '2:00 PM – 3:00 PM',
                title: 'Wan Chai Active Block',
                titleTc: '灣仔街區',
                icon: 'footprints',
                notes: 'Old Wan Chai market lanes and heritage buildings on foot; one snack. No shopping.',
                navigateTo: '鵝頸街市 寶靈頓道21號',
                addressTc: '香港灣仔寶靈頓道21號 鵝頸街市',
                guide: {
                  steps: [
                    {
                      label: 'Lanes',
                      detail: 'Bowrington Road Market (鵝頸街市, 21 Bowrington Road) → Tai Yuen Street → Cross Street (交加街).'
                    },
                    {
                      label: 'Heritage',
                      detail: 'Stone Nullah Lane for Blue House (藍屋); Lung On Street to Pak Tai Temple (北帝廟).'
                    },
                    {
                      label: 'Snack',
                      detail: 'Cha chaan teng: milk tea, pork chop bun (豬扒包) or egg sandwich.'
                    },
                    {
                      label: 'Leave by',
                      detail: '2:50 PM: footbridges past Convention Centre to Wan Chai Star Ferry Pier, ~20 min.'
                    }
                  ]
                }
              },
              {
                time: '~3:10 PM – 3:30 PM',
                title: 'Star Ferry: Wan Chai → TST',
                titleTc: '天星小輪：灣仔 → 尖沙咀',
                icon: 'ship',
                notes: 'Saturday daytime ferries every ~12 min until 4:48 PM.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Pier',
                      detail: 'Beside the Convention Centre; tap Octopus at the gate.'
                    },
                    {
                      label: 'On board',
                      detail: 'No eating or drinking.'
                    },
                    {
                      label: 'If missed',
                      detail: 'Next boat ~12 min later; don\'t run.'
                    }
                  ]
                }
              },
              {
                time: '3:35 PM – 3:55 PM',
                title: 'NBA ATELIER — Harbour City, Ocean Terminal (20 min)',
                titleTc: '海港城海運大廈・NBA ATELIER',
                icon: 'shopping-bag',
                notes: 'Shop OT306B, Level 3, Ocean Terminal; 2 min from Star Ferry. Lifestyle brand, not a full NBA Store. Mall 10:00 AM – 10:00 PM.',
                navigateTo: 'NBA ATELIER 海港城 海運大廈',
                addressTc: '九龍尖沙咀廣東道3-27號 海港城海運大廈3樓 OT306B',
                guide: {
                  steps: [
                    {
                      label: 'Before trip',
                      detail: 'Check nbastore.hk in case a full store has opened.'
                    },
                    {
                      label: 'Walk in',
                      detail: 'Ocean Terminal (海運大廈), harbour end of Harbour City; escalators to Level 3.'
                    },
                    {
                      label: 'Lost',
                      detail: 'Directory screen or concierge (tel 2986 8018).'
                    },
                    {
                      label: 'Leave by',
                      detail: '3:55 PM; Aqua Luna check-in 5:10 PM at TST Pier 1.'
                    }
                  ]
                }
              },
              {
                time: '4:00 PM – 4:50 PM',
                title: 'Flexible TST Harbour / Snack (Buffer)',
                titleTc: '尖沙咀海濱（緩衝）',
                icon: 'clock',
                notes: 'Buffer before the cruise – cut first if late. Harbour walk and snack, or rest at Sasa Inn.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Pier 1',
                      detail: 'TST Public Pier 1, near Star Ferry Pier and Clock Tower.'
                    },
                    {
                      label: 'Snack',
                      detail: 'Cheung Hing Kee (張興記, 48 Lock Road; 9:00 AM – 9:00 PM): pan-fried pork buns (生煎包).'
                    },
                    {
                      label: 'Or rest',
                      detail: 'Soy milk + protein bar from a convenience store, or Sasa Inn (87 Nathan Road).'
                    },
                    {
                      label: 'Be back',
                      detail: 'At Pier 1 by 5:10 PM.'
                    }
                  ]
                }
              },
              {
                time: '5:10 PM check-in · 5:30 PM – 6:15 PM sail',
                title: 'Aqua Luna Evening Harbour Cruise — Tsim Sha Tsui Pier 1',
                titleTc: '張保仔號・維港傍晚航程（尖沙咀1號碼頭）',
                icon: 'sailboat',
                notes: '5:30 PM from TST Public Pier 1 via Central Pier 9, ~45 min. HK$280 (≈ US$36) incl. one drink; non-refundable.',
                navigateTo: '尖沙咀1號公眾碼頭',
                addressTc: '尖沙咀1號公眾碼頭',
                guide: {
                  steps: [
                    {
                      label: 'Reschedule',
                      detail: 'One free reschedule 12+ hours before; within 12 hours HK$50 per person.'
                    },
                    {
                      label: 'Check in',
                      detail: 'Pier 1 by 5:10 PM, booking on phone.'
                    },
                    {
                      label: 'Drink',
                      detail: 'Free drink: Sundowner mocktail; deck lounge beds.'
                    },
                    {
                      label: 'If cancelled',
                      detail: 'Typhoon Signal No. 3 or Red Rainstorm+: cancelled; switch to the day\'s rain plan.'
                    }
                  ]
                },
                live: {
                  label: 'Sailing status',
                  url: 'https://aqualuna.com.hk/experiences/evening-harbour-cruise/'
                }
              },
              {
                time: '6:30 PM – 7:30 PM',
                title: 'Final Dinner — Hing Kee Claypot Rice',
                titleTc: '興記菜館・煲仔飯',
                icon: 'utensils',
                notes: 'Hing Kee (興記菜館), 15 Temple Street, Yau Ma Tei; 1:30–3:30 PM, 5:30 PM – midnight; cash or Octopus. Expect a wait; ~15 min from Pier 1.',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Each: chicken + Chinese sausage (滑雞臘腸), pork ribs (排骨) or beef with egg (窩蛋牛肉); greens.'
                    },
                    {
                      label: 'Eat',
                      detail: 'Soy sauce over, wait a minute, scrape the crust (飯焦).'
                    },
                    {
                      label: 'Backup',
                      detail: 'Long wait: Shing Kee Congee Noodle (盛記粥麵, 11 Parkes Street, Jordan): congee, noodles, brisket.'
                    },
                    {
                      label: 'Leave by',
                      detail: '7:30 PM; walk to the Cultural Centre waterfront.'
                    }
                  ]
                },
                navigateTo: '興記菜館 廟街15號',
                addressTc: '香港油麻地廟街15號 興記菜館'
              },
              {
                time: '7:45 PM – 8:20 PM',
                title: 'Winter Wonderland in Tsim Sha Tsui',
                titleTc: '尖沙咀冬日奇幻',
                icon: 'sparkles',
                notes: 'Final short pass: projections on Cultural Centre, Museum of Art, Space Museum; nightly 7–11 PM.',
                navigateTo: '香港文化中心 觀景台',
                addressTc: '九龍尖沙咀梳士巴利道10號 香港文化中心',
                guide: {
                  steps: [
                    {
                      label: 'New angle',
                      detail: 'Cultural Centre Viewing Deck, or outside the Museum of Art / Space Museum.'
                    },
                    {
                      label: 'Watch',
                      detail: 'One cycle; schedule can change without notice.'
                    }
                  ]
                }
              },
              {
                time: '8:30 PM – 10:00 PM',
                title: 'Arcade / Games — TST Late Night',
                titleTc: '尖沙咀遊戲機中心',
                icon: 'gamepad-2',
                notes: 'No late arcade verified – pick an open one, or swap for dessert and harbour (light show until 11 PM).',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Find one',
                      detail: 'Search 遊戲機中心 尖沙咀; nearest open.'
                    },
                    {
                      label: 'Final match',
                      detail: 'Best-of-three on racing or rhythm; loser buys dessert.'
                    },
                    {
                      label: 'Pay',
                      detail: 'Check tokens, Octopus or game card before topping up.'
                    }
                  ]
                }
              },
              {
                time: '10:00 PM – 11:00 PM',
                title: 'Final Dessert + Harbour',
                titleTc: '最後甜品・維港',
                icon: 'moon',
                notes: 'Kai Kai Dessert (佳佳甜品), G/F, 113–115 Parkes Street, Jordan; 12:00 noon – 1:00 AM.',
                navigateTo: '香港佐敦白加士街113-115號地下',
                addressTc: '香港佐敦白加士街113-115號地下',
                guide: {
                  steps: [
                    {
                      label: 'Get there',
                      detail: 'MTR one stop to Jordan, or walk up Nathan Road to Parkes Street.'
                    },
                    {
                      label: 'Order',
                      detail: 'Black sesame (芝麻糊), almond (杏仁茶), red bean with lotus seeds, tofu skin with ginkgo (腐竹白果).'
                    },
                    {
                      label: 'Harbour',
                      detail: 'Finish by the Clock Tower; walk up Nathan Road to the hotel.'
                    }
                  ]
                }
              },
              {
                time: '~11:15 PM – 11:45 PM',
                title: 'Back to Sasa Inn',
                titleTc: '返回新月賓館',
                icon: 'building-2',
                notes: 'Sasa Inn (新月賓館), Room C1, 8/F, Block C, 87 Nathan Road, Tsim Sha Tsui. Checkout tomorrow 8:30–8:45 AM.',
                navigateTo: '香港九龍尖沙咀彌敦道87號華源大廈C座8字樓C1室',
                addressTc: '香港九龍尖沙咀彌敦道87號華源大廈C座8字樓C1室',
                guide: {
                  steps: [
                    {
                      label: 'Pack',
                      detail: 'Checked bags tonight; keep passports, phones, chargers, last whey scoop out.'
                    },
                    {
                      label: 'Power banks',
                      detail: 'Hand luggage only, max two each; no recharging in flight.'
                    },
                    {
                      label: 'Cards',
                      detail: 'One Octopus/QR each for check-in and Airport Express; another card for everything else.'
                    },
                    {
                      label: 'Alarm',
                      detail: 'Set for the 8:30 AM checkout.'
                    }
                  ]
                }
              }
            ],
            backups: {
              foods: [
                {
                  title: 'DimSumHere — Jordan',
                  titleTc: '點心到（佐敦）',
                  note: 'If Yat Tung Heen falls through, a good dim sum fallback in Jordan.',
                  navigateTo: '香港油麻地廟街298號'
                }
              ]
            },
            foodRecommendation: 'Yat Tung Heen 逸東軒 dim sum brunch → expo snacks → Hing Kee claypot rice 興記煲仔飯 → Kai Kai Dessert 佳佳甜品',
            proteinHeadline: '25 g whey · food ~125 g',
            proteinPlan: '25 g before leaving; dim sum (char siu, siu mai, ribs) covers 40 g+; meat-forward final dinner.',
            insiderTip: 'Paid: Yat Tung Heen ~US$30–40, expo ~US$1, Aqua Luna ~US$36.'
          },
          {
            id: 'day-16',
            dayNum: '16',
            shortLabel: 'Home / 返程',
            city: 'Departure / 返程',
            dateString: 'Sun, Dec 13, 2026',
            timeZone: 'Asia/Hong_Kong',
            title: 'Bag Drop → Sham Shui Po → Airport Express → Flight to NYC',
            titleTc: '預辦登機・深水埗・機場快綫・返紐約',
            hotelRef: 'hk',
            transitSummary: 'Kowloon Station bag drop → MTR Sham Shui Po → Airport Express → CX840',
            weatherExpected: '~66°F • Mild daytime conditions',
            rainBackupAvailable: false,
            leaveByTime: '8:45 AM checkout',
            timeline: [
              {
                time: '8:30 AM – 8:45 AM',
                title: 'Checkout with Luggage',
                titleTc: '帶行李退房',
                icon: 'luggage',
                notes: 'Out by 8:45 AM; red taxi with luggage to Kowloon Station (港鐵九龍站) in-town check-in. HK$50+ meter: 50% off Octopus Airport Express (HK$52.5 adult).',
                navigateTo: '港鐵九龍站 市區預辦登機大堂',
                addressTc: '港鐵九龍站 市區預辦登機大堂',
                guide: {
                  steps: [
                    {
                      label: 'Before checkout',
                      detail: 'Last 25 g whey; rinse shaker, recycle or pack it.'
                    },
                    {
                      label: 'Taxi',
                      detail: 'To the in-town check-in hall (市區預辦登機大堂); printed receipt – no photos or screenshots.'
                    },
                    {
                      label: 'Taxi offer',
                      detail: 'Receipt to AEL Customer Service Centre before check-in. Up to 5; Octopus only; no combining.'
                    }
                  ]
                }
              },
              {
                time: '~9:00 AM – 9:25 AM',
                title: 'Kowloon Station Bag Drop',
                titleTc: '九龍站 市區預辦登機・寄行李',
                icon: 'luggage',
                notes: 'Check in online, then drop bags. Cathay desk 6:00 AM – 3:00 PM, 24 hours to 90 min before departure.',
                navigateTo: '港鐵九龍站 市區預辦登機大堂',
                addressTc: '港鐵九龍站 市區預辦登機大堂',
                guide: {
                  intro: 'Hands-free for the morning.',
                  steps: [
                    {
                      label: 'Online check-in',
                      detail: 'All three on Cathay app/site; opens ~4:35 PM Dec 12. Readable e-passport needed.'
                    },
                    {
                      label: 'Fare',
                      detail: 'Gate charges full Airport Express fare: HK$105 (Octopus, contactless, QR) or HK$115 (AEL QR ticket).'
                    },
                    {
                      label: 'Same card',
                      detail: 'Tap the same card/QR at the Airport Express platform gate. Octopus: max 9 taps between.'
                    },
                    {
                      label: 'Bag drop',
                      detail: 'Kiosk prints tags; bag drop: face scan, keep claim tag. 145 × 100 × 85 cm max.'
                    }
                  ],
                  recheck: 'Check bags in at Kowloon Station before 3:00 PM. Max 32 kg.'
                }
              },
              {
                time: '9:45 AM – 11:50 AM',
                title: 'Sham Shui Po — Breakfast, Market Streets, Old Kowloon',
                titleTc: '深水埗・早餐・街市・老九龍',
                icon: 'camera',
                notes: 'Short red taxi from Kowloon Station, or MTR on a non-check-in card. Start nothing you can\'t abandon instantly.',
                navigateTo: '香港深水埗鴨寮街',
                addressTc: '香港深水埗鴨寮街',
                guide: {
                  steps: [
                    {
                      label: 'Breakfast',
                      detail: 'Sun Heung Yuen (新香園(堅記), G/F, 38A Kweilin Street): toasted beef-and-egg sandwich.'
                    },
                    {
                      label: 'Tofu',
                      detail: 'Kung Wo (118 Pei Ho Street, 7:00 AM – 9:00 PM): sugar-free soy milk, 豆腐花, 魚腐.'
                    },
                    {
                      label: 'Cheung fun',
                      detail: 'Hop Yik Tai (合益泰小食, 121 Kweilin Street; 6:00 AM – 8:30 PM, cash only): mixed-sauce 豬腸粉.'
                    },
                    {
                      label: 'Apliu Street',
                      detail: '鴨寮街: phone accessories, cables, film cameras; haggle. Stop at 11:50 AM sharp.'
                    }
                  ]
                }
              },
              {
                time: '12:00 PM – 12:30 PM',
                title: 'Lunch — Lau Sum Kee Bamboo-Pole Noodles',
                titleTc: '劉森記麵家・竹昇麵',
                icon: 'utensils',
                notes: 'Lau Sum Kee (劉森記麵家), 82 Fuk Wing Street; opens 12:00 noon; cash only.',
                navigateTo: '劉森記麵家 福榮街82號',
                addressTc: '香港深水埗福榮街82號',
                guide: {
                  steps: [
                    {
                      label: 'Order',
                      detail: 'Dry-tossed noodles (撈麵) with brisket (牛腩) or pig\'s trotter and tendon, or shrimp-roe noodles (蝦子撈麵).'
                    },
                    {
                      label: 'Leave by',
                      detail: '12:30 PM: taxi to Kowloon Station (~15 min) on a non-check-in card.'
                    }
                  ]
                }
              },
              {
                time: '~12:30 PM – 12:45 PM',
                title: 'Back Toward Kowloon Station',
                titleTc: '返回九龍站',
                icon: 'train',
                notes: 'Check-in Octopus: MTR rides count towards its 9-tap limit – use another card or taxi.',
                noMap: true,
                guide: {
                  steps: [
                    {
                      label: 'Taxi',
                      detail: 'Red taxi from Fuk Wing Street to Kowloon Station (港鐵九龍站); cash or another card.'
                    },
                    {
                      label: 'MTR',
                      detail: 'Tung Chung Line (orange) at Nam Cheong, via Olympic to Kowloon; check MTR Mobile.'
                    },
                    {
                      label: 'Arrive',
                      detail: 'Follow Airport Express signs; boarding passes and passports in hand.'
                    }
                  ]
                }
              },
              {
                time: '12:50 PM – 1:15 PM',
                title: 'Airport Express → HKG',
                titleTc: '機場快綫：九龍站 → 機場',
                icon: 'train',
                notes: '~22 min, every ~10 min; arrive ~1:15 PM, bags checked. Fare taken at Kowloon; HK$210 group ticket doesn\'t apply.',
                navigateTo: 'Kowloon MTR Station, West Kowloon',
                guide: {
                  steps: [
                    {
                      label: 'Platform gate',
                      detail: 'Tap the same card/QR used at Kowloon; no further charge.'
                    },
                    {
                      label: 'Ride',
                      detail: 'Via Tsing Yi; get off at Airport.'
                    },
                    {
                      label: 'At HKG',
                      detail: 'Straight to Departures; e-passport holders 7+ can use e-Security Gates.'
                    },
                    {
                      label: 'Security',
                      detail: 'Power banks in hand luggage (max two each); extra US checks on electronics.'
                    }
                  ]
                }
              },
              {
                time: '4:35 PM – 7:05 PM',
                startAt: '2026-12-13T16:35:00+08:00',
                endAt: '2026-12-13T19:05:00-05:00',
                title: 'Cathay Pacific CX840 Non-Stop Flight to JFK',
                titleTc: '國泰航空 CX840：香港 → 紐約甘迺迪',
                icon: 'plane-takeoff',
                notes: 'Lands same calendar day (~15h30 non-stop). Boarding pass and live gate info are final.',
                noMap: true,
                guide: {
                  intro: 'The flight home crosses the International Date Line.',
                  steps: [
                    {
                      label: 'Gate',
                      detail: 'Boarding time on pass; gate on airport screens.'
                    },
                    {
                      label: 'Power banks',
                      detail: 'Max two each, hand luggage; no recharging from them in flight.'
                    },
                    {
                      label: 'On arrival',
                      detail: 'Declare all food and agricultural items in the US.'
                    }
                  ]
                }
              }
            ],
            backups: {},
            foodRecommendation: 'Sun Heung Yuen beef-and-egg sandwich → Kung Wo tofu → Hop Yik Tai cheung fun → Lau Sum Kee bamboo-pole noodles → CX840 meal',
            proteinHeadline: '25 g whey (the last scoop) · food ~125 g',
            proteinPlan: 'Last 25 g before checkout; rinse shaker, recycle or keep. Protein-heavy early lunch – plane food less controllable.',
            insiderTip: 'Declare all food and agricultural items on US arrival.'
          }
        ],

        get currentDay() {
          return this.days.find(d => d.id === this.activeDayId) || this.days[0];
        },

        get activeTabIndex() {
          return Math.max(0, ['today', 'itinerary', 'plan', 'toolkit'].indexOf(this.activeTab));
        },

        get currentCityTheme() {
          if (this.currentDay?.hotelRef === 'hk') return 'hk';
          if (this.currentDay?.hotelRef === 'kaohsiung') return 'kaohsiung';
          if (this.currentDay?.hotelRef === 'taipei') return 'taipei';
          return 'flight';
        },

        get currentTimelineIndex() {
          if (!this.relevantPlan || this.relevantPlan.targetKind !== 'event' || this.activeDayId !== this.relevantPlan.day.id) return -1;
          return this.relevantPlan.eventIndex;
        },

        get hasCurrentTimelineItem() {
          return Boolean(this.liveTripDayId);
        },

        get summaryTargetLabel() {
          if (!this.relevantPlan || this.activeDayId !== this.relevantPlan.day.id || this.relevantPlan.targetKind === 'event') return '';
          return this.relevantPlan.label;
        },

        get bookedCount() {
          return this.bookings.filter(b => this.bookedIds.includes(b.id)).length;
        },

        get adminPrepDoneCount() {
          return this.adminPrepList.filter(t => this.adminPrepDoneIds.includes(t.id)).length;
        },

        get bookingProgressPercent() {
          return this.bookings.length ? Math.round((this.bookedCount / this.bookings.length) * 100) : 0;
        },

        get prepProgressPercent() {
          return this.adminPrepList.length ? Math.round((this.adminPrepDoneCount / this.adminPrepList.length) * 100) : 0;
        },

        get openPlanCount() {
          return (this.bookings.length - this.bookedCount) + (this.adminPrepList.length - this.adminPrepDoneCount);
        },

        get isPreTrip() {
          return this.nowTick < new Date('2026-11-28T06:15:00-05:00').getTime();
        },

        get sortedBookings() {
          const ranked = this.rankedBookings;
          if (!Array.isArray(this.planOrder)) return ranked;
          // A booking added while Plan is open has no place yet: it goes first, where it was added.
          const place = new Map(this.planOrder.map((id, index) => [id, index]));
          return [...ranked].sort((a, b) => (place.has(a.id) ? place.get(a.id) : -1) - (place.has(b.id) ? place.get(b.id) : -1));
        },

        // The real ranking (open first, by action date). The Next action card always reads this,
        // so it stays right while the list's display order is held.
        get rankedBookings() {
          return [...this.bookings].sort((a, b) => {
            const aDone = this.bookedIds.includes(a.id);
            const bDone = this.bookedIds.includes(b.id);
            if (aDone !== bDone) return aDone ? 1 : -1;
            const aKey = this.getBookingSortKey(a);
            const bKey = this.getBookingSortKey(b);
            if (aKey !== bKey) return aKey - bKey;
            return this.bookings.indexOf(a) - this.bookings.indexOf(b);
          });
        },

        freezePlanOrder() {
          this.planOrder = this.rankedBookings.map(item => item.id);
        },

        get nextBookingAction() {
          return this.sortedBookings.find(item => !this.bookedIds.includes(item.id)) || null;
        },

        get nextPlanAction() {
          const booking = this.nextBookingAction;
          if (booking) {
            return {
              kind: 'bookings',
              title: booking.title,
              meta: `${this.getBookingReleaseLabel(booking.openDate, booking)} · ${booking.eventDate}`
            };
          }
          const prep = this.adminPrepList.find(task => !this.adminPrepDoneIds.includes(task.id));
          if (prep) return { kind: 'prep', title: prep.title, meta: this.getPrepCategory(prep) };
          return null;
        },

        get liveTripDayId() {
          return this.getLiveTripDayId(this.nowTick);
        },

        getLiveTripDayId(nowValue) {
          const now = Number(nowValue);
          const tripStartEpoch = new Date('2026-11-28T06:15:00-05:00').getTime();
          const day2StartEpoch = new Date('2026-11-29T14:05:00+08:00').getTime();
          const day16StartEpoch = new Date('2026-12-13T00:00:00+08:00').getTime();
          const tripEndEpoch = new Date('2026-12-13T19:05:00-05:00').getTime();

          if (!Number.isFinite(now) || now < tripStartEpoch) return null;
          if (now < day2StartEpoch) return 'day-01';
          if (now > tripEndEpoch) return null;
          if (now >= day16StartEpoch) return 'day-16';

          let tripLocalDate;
          try {
            tripLocalDate = new Intl.DateTimeFormat('en-CA', {
              timeZone: now < day16StartEpoch ? 'Asia/Taipei' : 'Asia/Hong_Kong',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            }).format(new Date(now));
          } catch (error) {
            return null;
          }

          const dayMap = {
            '2026-11-29': 'day-02',
            '2026-11-30': 'day-03',
            '2026-12-01': 'day-04',
            '2026-12-02': 'day-05',
            '2026-12-03': 'day-06',
            '2026-12-04': 'day-07',
            '2026-12-05': 'day-08',
            '2026-12-06': 'day-09',
            '2026-12-07': 'day-10',
            '2026-12-08': 'day-11',
            '2026-12-09': 'day-12',
            '2026-12-10': 'day-13',
            '2026-12-11': 'day-14',
            '2026-12-12': 'day-15',
            '2026-12-13': 'day-16'
          };

          return dayMap[tripLocalDate] || null;
        },

        get filteredDays() {
          return this.days.filter(d => {
            let matchesCity = true;
            if (this.selectedCityFilter === 'taipei') matchesCity = d.hotelRef === 'taipei';
            else if (this.selectedCityFilter === 'kaohsiung') matchesCity = d.hotelRef === 'kaohsiung';
            else if (this.selectedCityFilter === 'hk') matchesCity = d.hotelRef === 'hk';

            let matchesSearch = true;
            if (this.searchQuery.trim()) {
              const q = this.searchQuery.toLowerCase().trim();
              const backupText = [
                d.backups?.activity?.title, d.backups?.activity?.titleTc, d.backups?.activity?.note,
                ...(d.backups?.services || []).map(s => `${s.title} ${s.titleTc || ''} ${s.note || ''}`),
                ...(d.backups?.foods || []).map(f => `${f.title} ${f.titleTc || ''} ${f.note || ''}`)
              ].filter(Boolean).join(' ');

              const guideText = (d.timeline || []).map(t => {
                if (!t.guide) return '';
                const stepDetails = (t.guide.steps || []).map(s => `${s.label} ${s.detail}`).join(' ');
                return `${t.guide.intro || ''} ${stepDetails} ${t.guide.exit || ''} ${t.guide.recheck || ''}`;
              }).join(' ');

              const searchable = [
                d.dayNum, d.shortLabel, d.city, d.dateString, d.title, d.foodRecommendation, d.proteinPlan, d.insiderTip,
                ...d.timeline.map(t => `${t.title} ${t.titleTc || ''} ${t.notes || ''} ${t.addressTc || ''}`),
                backupText,
                guideText
              ].join(' ').toLowerCase();
              matchesSearch = searchable.includes(q);
            }
            return matchesCity && matchesSearch;
          });
        },

        get liveAccessoryTitle() {
          if (!this.relevantPlan?.day) return '';
          if (this.relevantPlan.targetKind === 'event') {
            return this.relevantPlan.day.timeline?.[this.relevantPlan.eventIndex]?.title || this.relevantPlan.day.title;
          }
          return this.relevantPlan.day.title;
        },

        get liveAccessoryMeta() {
          if (!this.relevantPlan?.day) return '';
          const item = this.relevantPlan.targetKind === 'event'
            ? this.relevantPlan.day.timeline?.[this.relevantPlan.eventIndex]
            : null;
          if (!item) return this.relevantPlan.day.shortLabel || '';
          const { start, end } = this.clockBounds(item.time);
          // Short, as Japan's capsule: the state, then the one time that matters.
          if (this.relevantPlan.state === 'current') {
            const left = this.minutesLeftText(this.relevantPlan);
            return left ? `Now · ${left}` : (end ? `Now · until ${end}` : 'Now');
          }
          return start ? `Next · ${start}` : 'Next';
        },

        // When the current stop ends, by the same rule resolveRelevantPlan uses to call it current:
        // its own end, cut short by the next stop's start; else the next start; else two hours.
        currentStopEnd(plan) {
          if (!plan?.day || plan.targetKind !== 'event' || plan.state !== 'current') return NaN;
          const items = plan.day.timeline || [];
          const item = items[plan.eventIndex];
          if (!item) return NaN;
          if (item.startAt && item.endAt) {
            const end = Date.parse(item.endAt);
            return Number.isFinite(end) ? end : NaN;
          }
          const start = this.parseTimelineStartMinutes(item.time);
          const explicitEnd = this.parseTimelineEndMinutes(item.time);
          const nextStart = plan.eventIndex + 1 < items.length ? this.parseTimelineStartMinutes(items[plan.eventIndex + 1].time) : NaN;
          const endMinutes = Number.isFinite(explicitEnd)
            ? Math.min(explicitEnd, Number.isFinite(nextStart) ? nextStart : explicitEnd)
            : Number.isFinite(nextStart) ? nextStart : start + 120;
          const nowMinutes = this.getScheduleMinutes(this.nowTick, plan.day.timeZone);
          if (![start, endMinutes, nowMinutes].every(Number.isFinite) || endMinutes <= start) return NaN;
          return this.nowTick + (endMinutes - nowMinutes) * 60000;
        },

        minutesLeftText(plan) {
          const end = this.currentStopEnd(plan);
          if (!Number.isFinite(end)) return '';
          // Rounded up, so the last minute reads "1m left" until the stop really ends.
          const minutes = Math.ceil((end - this.nowTick) / 60000);
          if (minutes <= 0) return '';
          return minutes < 60 ? `${minutes}m left` : `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
        },

        // "Taiwan 10:30 AM · Home 9:30 PM": the local clock and New York, as Japan's Now card shows.
        // Real zones, so the gap is right whichever side of a daylight-saving change it falls. The
        // place is where the travellers are: Day 1 starts at home (home first, then Taiwan), and
        // the transfer day is Taiwan until its Hong Kong touchdown.
        liveClockText(day) {
          try {
            const fmt = timeZone => {
              if (!CLOCK_FORMATS.has(timeZone)) CLOCK_FORMATS.set(timeZone, new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }));
              return CLOCK_FORMATS.get(timeZone).format(new Date(this.nowTick));
            };
            const home = `Home ${fmt('America/New_York')}`;
            if (!day || day.timeZone === 'America/New_York') return `${home} · Taiwan ${fmt('Asia/Taipei')}`;
            let inHongKong = day.timeZone === 'Asia/Hong_Kong';
            if (!inHongKong && day.hotelRef === 'hk') {
              const touchdown = (day.timeline || []).find(item => item.icon === 'plane-landing');
              const at = touchdown ? this.parseTimelineStartMinutes(touchdown.time) : NaN;
              const now = this.getScheduleMinutes(this.nowTick, day.timeZone);
              inHongKong = Number.isFinite(at) && Number.isFinite(now) && now >= at;
            }
            return inHongKong ? `Hong Kong ${fmt('Asia/Hong_Kong')} · ${home}` : `Taiwan ${fmt('Asia/Taipei')} · ${home}`;
          } catch (_) {
            return '';
          }
        },

        // First and last clock times in a free-text time ("5:10 PM check-in · 5:30 PM – 6:15 PM
        // sail" → 5:10 PM / 6:15 PM). Splitting on dashes cut at the hyphen in "check-in".
        clockBounds(text) {
          const times = String(text || '').match(/~?\d{1,2}:\d{2}(?:\s*[AP]M)?/gi) || [];
          return { start: times[0] || '', end: times.length > 1 ? times[times.length - 1] : '' };
        },

        // The Now card: the same plan object the capsule reads, so the two can never disagree.
        get nowCard() {
          const plan = this.relevantPlan;
          if (!this.liveTripDayId || !plan?.day) return null;
          const lang = plan.day.hotelRef === 'hk' ? 'zh-HK' : 'zh-TW';
          // Once the day's plan is done the card hands over to tomorrow, as the Japan app does at night.
          if (plan.targetKind === 'complete') {
            const tomorrow = this.tomorrowPreview(plan.day);
            return { state: 'done', time: '', title: 'That’s the plan for today', titleTc: '今日行程完成', lang, progress: null, left: '', leave: '', leaveUrgent: false, next: tomorrow ? tomorrow.text : 'Last day of the trip', clock: this.liveClockText(plan.day) };
          }
          if (plan.targetKind !== 'event') return null;
          const items = plan.day.timeline || [];
          const item = items[plan.eventIndex];
          if (!item) return null;
          const next = items[plan.eventIndex + 1] || null;
          let progress = null;
          if (plan.state === 'current') {
            const startAt = Date.parse(item.startAt), endAt = Date.parse(item.endAt);
            if (Number.isFinite(startAt) && Number.isFinite(endAt) && endAt > startAt) {
              progress = (this.nowTick - startAt) / (endAt - startAt);
            } else {
              const now = this.getScheduleMinutes(this.nowTick, plan.day.timeZone);
              const start = this.parseTimelineStartMinutes(item.time);
              const explicitEnd = this.parseTimelineEndMinutes(item.time);
              const nextStart = next ? this.parseTimelineStartMinutes(next.time) : NaN;
              const end = Number.isFinite(explicitEnd) ? explicitEnd : Number.isFinite(nextStart) ? nextStart : start + 120;
              if ([now, start, end].every(Number.isFinite) && end > start) progress = (now - start) / (end - start);
            }
            if (progress !== null) progress = Math.max(0, Math.min(1, progress));
          }
          const leave = plan.day.id === this.liveTripDayId ? this.computeLeaveByCountdownForDay(plan.day) : null;
          const nextStartText = next ? this.clockBounds(next.time).start : '';
          return {
            state: plan.state === 'current' ? 'now' : 'next',
            time: item.time,
            title: item.title,
            titleTc: item.titleTc || '',
            lang: plan.day.hotelRef === 'hk' ? 'zh-HK' : 'zh-TW',
            progress,
            left: plan.state === 'current' ? this.minutesLeftText(plan) : '',
            leave: leave ? leave.label : '',
            leaveUrgent: Boolean(leave && (leave.urgency === 'now' || leave.urgency === 'urgent')),
            next: next ? `${plan.state === 'current' ? 'Next' : 'Then'} ${nextStartText} · ${next.title}` : (this.tomorrowPreview(plan.day)?.text || ''),
            clock: this.liveClockText(plan.day)
          };
        },

        get fxSummary() {
          if (this.fx.loading) return 'FX · updating…';
          const twd = Number(this.currencyRates.TWD || 0).toFixed(2);
          const hkd = Number(this.currencyRates.HKD || 0).toFixed(2);
          const date = this.fx.rateDate ? ` · ${this.fx.rateDate}` : '';
          const label = this.fx.source === 'live' ? 'FX latest' : this.fx.source === 'cached' ? 'FX cached' : 'FX offline';
          return `${label}${date} · US$1 = NT$${twd} · HK$${hkd}`;
        },

        init() {
          window.addEventListener('twhk-storage-failed', () => this.notifyStorageFailure());
          if (window.__twhkStorageWriteFailed) this.notifyStorageFailure();
          window.addEventListener('twhk-update-ready', () => {
            this.appUpdateAvailable = true;
            this.refreshIcons();
          });
          window.addEventListener('twhk-update-applied', () => { this.appUpdateAvailable = false; });
          window.addEventListener('offline', () => this.showToast('Offline mode — the saved itinerary is still available', 'warning'));
          window.addEventListener('online', () => this.showToast('Back online'));
          this.applyAppearance();
          // Confirms a requested update after the fact. The flag is set immediately
          // before the reload, so this is the first chance to say anything about it;
          // delayed so the toast lands after the UI has settled rather than during boot.
          try {
            if (sessionStorage.getItem('twhk-just-updated')) {
              sessionStorage.removeItem('twhk-just-updated');
              setTimeout(() => this.showToast('Trip guide updated'), 900);
            }
          } catch (_) {}
          // ⌘/Ctrl+K anywhere, and bare `/` only when not already typing — otherwise the
          // slash key would be unusable inside the search field itself.
          window.addEventListener('keydown', event => {
            const target = event.target;
            const editable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
            const commandSearch = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
            const slashSearch = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !editable;
            if (this.showSheet || (!commandSearch && !slashSearch)) return;
            event.preventDefault();
            this.openGlobalSearch();
          });

          this.mergeCustomItems(getStorage('twhk_custom_bookings_v1', []), getStorage('twhk_custom_prep_v1', []));
          this.attachVerifiedDetails();
          this.sanitizePersistentState();
          this.runSemanticQa();
          document.documentElement.classList.toggle('data-saver', Boolean(navigator.connection?.saveData));
          this.determineCurrentDay();
          this.nowTick = this.clockNow();
          this.relevantPlan = this.resolveRelevantPlan(this.nowTick);
          this.smartLaunchActive = this.shouldSmartLaunch();
          if (this.smartLaunchActive) {
            this.activeTab = 'today';
            history.scrollRestoration = 'manual';
          } else {
            const queryDay = new URLSearchParams(location.search).get('day');
            if (this.days.some(day => day.id === queryDay)) this.activeTab = 'today';
          }
          this.updateCountdown();
          this.updateAppBadge();
          const tickOnTheMinute = () => {
            // Next tick first: one exception in a refresh must not stop live updates for the session.
            this._minuteTimer = window.setTimeout(tickOnTheMinute, 60000 - (Date.now() % 60000) + 40);
            this.refreshLiveContext(true);
          };
          this._minuteTimer = window.setTimeout(tickOnTheMinute, 60000 - (Date.now() % 60000) + 40);
          // A rotation re-centres the selected day; the old offset belongs to the old width.
          window.addEventListener('resize', () => {
            cancelAnimationFrame(this._railResizeFrame);
            this._railResizeFrame = requestAnimationFrame(() => { if (this.activeTab === 'today') this.scrollActiveDayChip(); });
          }, { passive: true });
          // A finger or wheel on the page during a landing glide means the reader has taken over.
          const noteUserScroll = () => { this._userScrolledAt = performance.now(); };
          window.addEventListener('touchstart', noteUserScroll, { passive: true, capture: true });
          window.addEventListener('wheel', noteUserScroll, { passive: true, capture: true });
          if (this.activeTab === 'plan') this.freezePlanOrder();
          this.refreshExchangeRates();
          this.refreshIcons();
          this.syncThemeColor();
          this.checkOfflineReady();
          navigator.serviceWorker?.addEventListener?.('controllerchange', () => this.checkOfflineReady());
          window.setTimeout(() => this.checkOfflineReady(), 8000);
          this.requestPersistentStorage();
          this.$nextTick(() => this.scrollActiveDayChip());
          if (this.smartLaunchActive) {
            // With a Now card the top of Today is the live context; otherwise land on the day.
            window.setTimeout(() => requestAnimationFrame(() => this.showLiveTop()), 120);
          }

          document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
              // A preview ends first, so the day noted is the real one, not the previewed one.
              if (this.isSimulated) this.resetToLiveTime(true);
              this._hiddenAt = Date.now();
              this._hiddenLiveDayId = this.liveTripDayId;
              return;
            }
            const away = this._hiddenAt ? Date.now() - this._hiddenAt : 0;
            const liveDayBefore = this._hiddenAt ? this._hiddenLiveDayId : null;
            this._hiddenAt = 0;
            this._hiddenLiveDayId = null;
            this.checkOfflineReady();
            // WebKit drops a screen wake lock whenever the page is hidden; take it back for an open Show card.
            if (this.showSheet === 'show') this.requestWakeLock();
            this.refreshLiveContext(true);
            this.refreshExchangeRates();
            // Opening the app again after a while is a fresh look: today and what is happening now.
            // A quick trip to Maps or a chat keeps your place, and an open sheet is never pulled away.
            const longAway = away >= 10 * 60 * 1000 || (liveDayBefore && liveDayBefore !== this.liveTripDayId);
            if (longAway && this.liveTripDayId && !this.isSimulated && !this.anyModalOpen) this.returnToLive();
            else this.$nextTick(() => this.scrollActiveDayChip());
          });
          window.addEventListener('pageshow', () => {
            if (!document.hidden) this.refreshLiveContext(true);
          });

          this.$watch('activeTab', (val) => {
            setStorage('twhk_active_tab_v10', JSON.stringify(val));
            this.refreshIcons();
            this.animateContent('.tab-pane');
            if (val === 'plan') this.freezePlanOrder();
            else this.planOrder = null;
            // The rail cannot be measured while Today is hidden, so a day picked elsewhere (Itinerary,
            // search, the Now capsule, midnight) is centred on the frame Today is shown.
            if (val === 'today') this.$nextTick(() => requestAnimationFrame(() => this.scrollActiveDayChip()));
          });

          this.$watch('planView', (val) => {
            setStorage('twhk_plan_view_v20', JSON.stringify(val));
            this.refreshIcons();
            this.animateContent('.plan-panel');
          });

          this.$watch('selectedCurrency', (val) => {
            if (['USD', 'TWD', 'HKD'].includes(val)) setStorage('twhk_currency_v23', JSON.stringify(val));
          });

          this.$watch('activeDayId', (val) => {
            if (!this.isSimulated) setStorage('twhk_active_day_v10', JSON.stringify(val));
            this.takeItEasyActive = false;
            this.rainPlanActive = false;
            this.syncThemeColor();
            this.refreshIcons();
            // The selected day is always centred, with its neighbours either side. The move is
            // instant: a smooth scroll still running when the next tap lands makes iOS spend that
            // tap on stopping the motion.
            this.$nextTick(() => this.scrollActiveDayChip());
          });

          this.$watch('takeItEasyActive', () => this.refreshIcons());
          this.$watch('rainPlanActive', () => this.refreshIcons());
          this.$watch('selectedCityFilter', () => this.refreshIcons());
          // Results render new <i data-lucide> nodes; without this they stayed as empty dots.
          this.$watch('globalSearchQuery', () => this.$nextTick(() => { this.refreshIcons(); this.paintSearchHighlights(); }));
          this.$watch('showSheet', value => this.refreshIcons(value));
        },

        sanitizeIdList(value, validIds) {
          const source = Array.isArray(value) ? value : [];
          const allowed = new Set(validIds);
          return [...new Set(source.filter(id => typeof id === 'string' && allowed.has(id)))];
        },

        sanitizePersistentState() {
          this.completedDayIds = this.sanitizeIdList(this.completedDayIds, this.days.map(day => day.id));
          this.bookedIds = this.sanitizeIdList(this.bookedIds, this.bookings.map(item => item.id));
          this.adminPrepDoneIds = this.sanitizeIdList(this.adminPrepDoneIds, this.adminPrepList.map(item => item.id));
          if (!['today', 'itinerary', 'plan', 'toolkit'].includes(this.activeTab)) this.activeTab = 'today';
          if (!['bookings', 'prep'].includes(this.planView)) this.planView = 'bookings';
          if (!['USD', 'TWD', 'HKD'].includes(this.selectedCurrency)) this.selectedCurrency = 'USD';
          this.bookingRefs = this.sanitizeBookingRefs(this.bookingRefs);
        },

        get countdownShortText() {
          const text = String(this.countdownText || '');
          const countdown = text.match(/^(\d+) days? to go/i);
          if (countdown) return `${countdown[1]}d`;
          if (/^Departs today/i.test(text)) return 'Today';
          const live = text.match(/^Day (\d+) of (\d+)/i);
          if (live) return `Day ${live[1]}`;
          if (/Trip Live/i.test(text)) return 'Live';
          if (/Trip Complete/i.test(text)) return 'Done';
          return text;
        },

        prefersReducedMotion() {
          return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        },

        setMotionDirection(currentIndex, nextIndex) {
          this.motionDirection = nextIndex < currentIndex ? 'backward' : 'forward';
        },

        switchTab(tab, resetScroll = false) {
          if (!['today', 'itinerary', 'plan', 'toolkit'].includes(tab)) return;
          if (tab === this.activeTab) {
            if (resetScroll) window.scrollTo({ top: 0, behavior: this.prefersReducedMotion() ? 'auto' : 'smooth' });
            return;
          }
          const tabOrder = ['today', 'itinerary', 'plan', 'toolkit'];
          this.smartLaunchActive = false;
          const fromIndex = tabOrder.indexOf(this.activeTab);
          this.setMotionDirection(fromIndex, tabOrder.indexOf(tab));
          this.tabScrollPositions[this.activeTab] = window.scrollY || 0;
          const targetY = resetScroll ? 0 : (this.tabScrollPositions[tab] || 0);
          this.activeTab = tab;
          document.documentElement.classList.remove('dock-compact');
          this.animateNavSelection('.mobile-nav-lens, .nav-lens', fromIndex, tabOrder.indexOf(tab), 4);
          this.$nextTick(() => requestAnimationFrame(() => {
            if (this.activeTab === tab) window.scrollTo({ top: targetY, behavior: 'instant' });
            // A short cross-fade, so a tab change reads as a change of place rather than a cut.
            // Opacity and a 6px rise only: no view transition (its overlay can eat the next tap on iOS).
            const pane = document.querySelector(`[data-tab-pane="${tab}"]`) || [...document.querySelectorAll('main .tab-pane')].find(el => el.offsetParent !== null);
            if (pane && pane.animate && !this.prefersReducedMotion()) {
              pane.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
            }
          }));
        },

        // Researched hours, prices, access and sources per stop (assets/details.js, built from
        // data/details/*.json). A stop is matched by index and exact title, so a renamed stop
        // drops its details rather than showing another stop's facts.
        attachVerifiedDetails() {
          const all = window.TWHK_DETAILS || {};
          const mismatched = [];
          for (const day of this.days) {
            const entry = all[day.id];
            if (!entry) continue;
            for (const [index, details] of Object.entries(entry.items || {})) {
              const item = day.timeline?.[Number(index)];
              if (!item || item.title !== details.title) { mismatched.push(`${day.id}#${index}`); continue; }
              const sources = (details.sources || []).filter(source => /^https?:\/\//i.test(source.url || ''));
              item.details = { ...details, sources, checked: entry.checked };
            }
          }
          if (mismatched.length) console.warn('[details] unmatched stops:', mismatched.join(', '));
          return mismatched;
        },

        checkedLabel(isoDate) {
          const date = new Date(`${isoDate}T12:00:00`);
          return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        },

        // A tab bar tap: the current tab again scrolls to the top, as every iOS tab bar does.
        tapTab(tab) {
          if (tab !== this.activeTab) return this.switchTab(tab);
          document.documentElement.classList.remove('dock-compact');
          window.scrollTo({ top: 0, behavior: this.prefersReducedMotion() ? 'auto' : 'smooth' });
        },

        // The lens stretches along its path and settles; the new symbol bounces once (SF Symbols).
        animateNavSelection(lensSelector, fromIndex, toIndex, iconScope) {
          if (this.prefersReducedMotion() || fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
          const sx = 1 + Math.min(0.34, 0.14 + 0.08 * (Math.abs(toIndex - fromIndex) - 1));
          const sy = 1 - (sx - 1) * 0.4;
          document.querySelectorAll(lensSelector).forEach(lens => {
            if (!lens.animate || !lens.getClientRects().length) return;
            lens.animate([{ scale: '1 1' }, { scale: `${sx} ${sy}`, offset: 0.36 }, { scale: '1 1' }], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' });
          });
          if (!iconScope) return;
          this.$nextTick(() => document.querySelectorAll('.mobile-nav-item.is-active svg, .nav-item.is-active svg').forEach(icon => {
            if (!icon.animate || !icon.getClientRects().length) return;
            icon.animate([{ scale: '1' }, { scale: '0.82', offset: 0.28 }, { scale: '1.1', offset: 0.64 }, { scale: '1' }], { duration: 460, easing: 'ease-out' });
          }));
        },

        switchPlanView(view, moveFocus = false) {
          if (!['bookings', 'prep'].includes(view)) return;
          if (view === this.planView) return;
          const viewOrder = ['bookings', 'prep'];
          this.setMotionDirection(viewOrder.indexOf(this.planView), viewOrder.indexOf(view));
          this.animateNavSelection('.plan-switch-lens', viewOrder.indexOf(this.planView), viewOrder.indexOf(view), 0);
          this.planView = view;
          if (moveFocus) this.$nextTick(() => document.getElementById(`plan-tab-${view}`)?.focus({ preventScroll: true }));
        },

        openPlan(view = 'bookings') {
          if (['bookings', 'prep'].includes(view)) this.planView = view;
          this.switchTab('plan', true);
        },

        canUseDayViewTransition() {
          // Full-document view-transition snapshots are lovely with a mouse, but their
          // temporary overlay can consume the next tap on iOS while the 420ms animation
          // is still settling. Day selection is a high-frequency control, so coarse
          // pointers get the immediate DOM update + lightweight content animation.
          return !this.prefersReducedMotion()
            && document.visibilityState === 'visible'
            && typeof document.startViewTransition === 'function'
            && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        },

        switchDay(dayId) {
          if (!dayId || dayId === this.activeDayId || !this.days.some(day => day.id === dayId)) return;
          this.smartLaunchActive = false;
          this.setMotionDirection(
            this.days.findIndex(day => day.id === this.activeDayId),
            this.days.findIndex(day => day.id === dayId)
          );

          const commit = () => new Promise(resolve => {
            this.activeDayId = dayId;
            this.$nextTick(resolve);
          });

          if (this.canUseDayViewTransition()) {
            // A rapid second selection should replace the animation, never be ignored.
            try { this._dayTransition?.skipTransition?.(); } catch (_) {}
            document.documentElement.dataset.dayTransition = this.motionDirection;
            try {
              const transition = document.startViewTransition(commit);
              this._dayTransition = transition;
              transition.finished.finally(() => {
                if (this._dayTransition === transition) this._dayTransition = null;
                delete document.documentElement.dataset.dayTransition;
              });
            } catch (_) {
              this.activeDayId = dayId;
              this.playDayChange();
            }
          } else {
            // Synchronous on touch devices: the selected chip responds in the same frame.
            this.activeDayId = dayId;
            this.playDayChange();
          }
        },

        beginDayChipPress(event, dayId) {
          if (!event || event.isPrimary === false) return;
          this._dayChipPress = {
            dayId,
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            at: performance.now()
          };
        },

        cancelDayChipPress(event) {
          if (!this._dayChipPress) return;
          if (!event || event.pointerId === this._dayChipPress.pointerId) this._dayChipPress = null;
        },

        endDayChipPress(event, dayId) {
          const press = this._dayChipPress;
          this._dayChipPress = null;
          if (!press || press.dayId !== dayId || press.pointerId !== event.pointerId) return;
          const dx = event.clientX - press.x;
          const dy = event.clientY - press.y;
          const elapsed = performance.now() - press.at;
          // A real rail drag remains a scroll. A stationary tap commits on pointer-up,
          // before WebKit decides whether to synthesize the later click event.
          if (Math.hypot(dx, dy) > 14 || elapsed > 900) return;
          this._dayChipTapGuard = { dayId, until: performance.now() + 650 };
          this.selectDayFromStrip(dayId);
        },

        activateDayChipClick(event, dayId) {
          const guard = this._dayChipTapGuard;
          // A keyboard or switch activation (detail 0) is always its own choice.
          if (guard && performance.now() < guard.until && event?.detail !== 0) {
            this._dayChipTapGuard = null;
            return;
          }
          this.selectDayFromStrip(dayId);
        },

        selectDayFromStrip(dayId, positionPlan = null) {
          if (!dayId || !this.days.some(day => day.id === dayId)) return;
          if (dayId === this.activeDayId) {
            this.smartLaunchActive = false;
            this.scrollActiveDayChip();
          } else {
            this.switchDay(dayId);
          }
          this.$nextTick(() => requestAnimationFrame(() => {
            if (positionPlan) this.positionRelevantPlan(positionPlan, 'auto');
            else this.revealDayTop();
          }));
        },

        // After a day change, bring the day's hero into view only if it is hidden under the pinned
        // bars. Near the top (Now card, rail and hero all in view) the page stays put, so the rail
        // does not jump up under the finger that just tapped it.
        revealDayTop() {
          const hero = document.getElementById('day-summary');
          if (!hero || !hero.getClientRects().length) return;
          if (hero.getBoundingClientRect().top >= this.pinnedChromeBottom() - 4) return;
          this.positionRelevantPlan({ targetKind: 'day-summary' }, 'auto');
        },

        playDayChange() {
          this.animateContent('.hero-head, .today-content-grid');
          // The new day's photo fades up in place instead of cutting.
          this.$nextTick(() => {
            const img = document.querySelector('.destination-photo img');
            if (img && img.animate && !this.prefersReducedMotion()) img.animate([{ opacity: .5 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
          });
        },

        animateContent(selector) {
          this.$nextTick(() => {
            document.querySelectorAll(selector).forEach(element => {
              element.getAnimations().filter(animation => animation.id === 'trip-content-change').forEach(animation => animation.cancel());
              if (this.prefersReducedMotion() || !element.animate || element.style.display === 'none') return;
              const shift = this.motionDirection === 'backward' ? -8 : 8;
              const animation = element.animate([
                { opacity: .88, transform: `translate3d(${shift}px, 0, 0)` },
                { opacity: 1, transform: 'translate3d(0, 0, 0)' }
              ], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
              animation.id = 'trip-content-change';
            });
          });
        },

        // The Now card, the capsule, the locate button and "Back to live day" all come here: today,
        // on the stop happening now (or next), placed just under the rail and marked as it lands.
        // The plan is resolved afresh, so a tap never lands on the stop of a minute ago.
        openLiveContext() {
          this.nowTick = this.clockNow();
          const plan = this.resolveRelevantPlan(this.nowTick);
          if (!plan?.day) return;
          this.relevantPlan = plan;
          this.lastLiveTripDayId = plan.day.id;
          this._liveMoveSeq = (Number(this._liveMoveSeq) || 0) + 1;
          const moved = plan.day.id !== this.activeDayId || this.activeTab !== 'today';
          if (plan.day.id !== this.activeDayId) this.showDayNow(plan.day.id);
          if (this.activeTab !== 'today') this.switchTab('today');
          this.smartLaunchActive = false;
          const target = plan.targetKind === 'event' ? plan : { targetKind: plan.targetKind === 'complete' ? 'complete' : 'day-summary' };
          this.$nextTick(() => requestAnimationFrame(() => this.landOn(target, moved)));
        },

        // A day change made for the reader (live context, resume): synchronous, so the measuring
        // that follows sees the new day; a view transition would commit it a frame later.
        showDayNow(dayId) {
          this.setMotionDirection(
            this.days.findIndex(day => day.id === this.activeDayId),
            this.days.findIndex(day => day.id === dayId)
          );
          try { this._dayTransition?.skipTransition?.(); } catch (_) {}
          this.activeDayId = dayId;
          this.playDayChange();
        },

        planTarget(plan) {
          if (!plan) return null;
          const target = plan.targetKind === 'event'
            ? document.getElementById(`timeline-item-${plan.eventIndex}`)
            : plan.targetKind === 'day-summary' ? document.getElementById('day-summary') : null;
          return target || document.getElementById('day-complete-target');
        },

        landOn(plan, jump = false) {
          const target = this.planTarget(plan);
          if (!target || !target.getClientRects().length) return;
          const distance = Math.abs(target.getBoundingClientRect().top - (this.pinnedChromeBottom() + 12));
          // Glide when the stop is near; jump when it is a screenful or more away, or the day or tab changed.
          const behavior = jump || this.prefersReducedMotion() || distance > window.innerHeight * 1.25 ? 'auto' : 'smooth';
          const startedAt = performance.now();
          // A number, not an object: read back through Alpine's reactive proxy an object is a
          // wrapper, never === the original, so the landing would never be recognised as current.
          const landing = this._landingSeq = (Number(this._landingSeq) || 0) + 1;
          this.positionRelevantPlan(plan, behavior);
          this.whenScrollSettles(() => {
            if (this._landingSeq !== landing) return;
            const again = this.planTarget(plan);
            if (!again) return;
            // A glide can end short if something above changes height on the way. Finish the move,
            // unless the reader has started scrolling since.
            const tookOver = (this._userScrolledAt || 0) > startedAt;
            const off = Math.abs(again.getBoundingClientRect().top - (this.pinnedChromeBottom() + 12));
            if (!tookOver && off > 2) this.positionRelevantPlan(plan, 'auto');
            this.flashSearchTarget(again.id);
          });
        },

        // Calls back once the page has stopped moving (two still samples), or after 1.6s at most.
        whenScrollSettles(callback) {
          let last = window.scrollY;
          let still = 0;
          let waited = 0;
          const sample = () => {
            waited += 70;
            const y = window.scrollY;
            still = Math.abs(y - last) < 0.5 ? still + 1 : 0;
            last = y;
            if (still >= 2 || waited >= 1600) callback();
            else window.setTimeout(sample, 70);
          };
          window.setTimeout(sample, 70);
        },

        // Today at the top: the Now card when there is one, else the day's hero.
        showLiveTop() {
          if (this.nowCard) {
            const root = document.documentElement;
            const previous = root.style.scrollBehavior;
            root.style.scrollBehavior = 'auto';
            window.scrollTo({ top: 0, behavior: 'auto' });
            root.style.scrollBehavior = previous;
          } else {
            this.positionRelevantPlan({ targetKind: 'day-summary' }, 'auto');
          }
        },

        // The logo and title: home is Today on the day that is live now, scrolled to its top.
        // Before the trip there is no live day, so it is the day the app opens on.
        goHome() {
          if (this.showGlobalSearch) this.closeGlobalSearch();
          const livePlan = this.resolveRelevantPlan(this.clockNow());
          const homeDayId = livePlan?.day?.id || 'day-02';
          // Already there and at the top: say so, so the tap never looks dead.
          if (this.activeTab === 'today' && this.activeDayId === homeDayId && (window.scrollY || 0) < 12) {
            const day = this.days.find(candidate => candidate.id === homeDayId);
            this.showToast(`You're home · ${day?.dateString || 'Today'}`);
            return;
          }
          if (livePlan?.day) return this.returnToLive();
          const home = homeDayId;
          if (this.activeTab !== 'today') this.switchTab('today', true);
          if (this.activeDayId !== home) {
            this.showDayNow(home);
            this.$nextTick(() => requestAnimationFrame(() => {
              window.scrollTo({ top: 0, behavior: 'auto' });
              this.scrollActiveDayChip();
            }));
          } else {
            window.scrollTo({ top: 0, behavior: this.prefersReducedMotion() ? 'auto' : 'smooth' });
          }
        },

        // Back to today after time away, as a fresh launch would be.
        returnToLive() {
          this.nowTick = this.clockNow();
          const plan = this.resolveRelevantPlan(this.nowTick);
          if (!plan?.day) return;
          // Supersedes a midnight reposition queued just before, and a landing left over from a tap
          // made just before the app was put away.
          this._liveMoveSeq = (Number(this._liveMoveSeq) || 0) + 1;
          this._landingSeq = (Number(this._landingSeq) || 0) + 1;
          this.relevantPlan = plan;
          this.lastLiveTripDayId = plan.day.id;
          if (this.activeTab !== 'today') {
            this.tabScrollPositions[this.activeTab] = window.scrollY || 0;
            this.activeTab = 'today';
          }
          if (this.activeDayId !== plan.day.id) this.showDayNow(plan.day.id);
          this.smartLaunchActive = true;
          this.$nextTick(() => requestAnimationFrame(() => { this.showLiveTop(); this.scrollActiveDayChip(); }));
        },

        runSemanticQa() {
          const issues = [];
          let checks = 0;
          const check = (condition, message) => { checks += 1; if (!condition) issues.push(message); };
          const unique = values => new Set(values).size === values.length;

          check(this.days.length === 16, 'Trip must contain exactly 16 days.');
          check(unique(this.days.map(day => day.id)), 'Day IDs must be unique.');
          check(unique(this.days.map(day => day.dayNum)), 'Day numbers must be unique.');
          check(this.days.every((day, index) => Number(day.dayNum) === index + 1), 'Day numbers must be ordered 01–16.');
          check(this.days.every(day => day.title && day.dateString && day.timeZone && Array.isArray(day.timeline) && day.timeline.length), 'Every day needs title, date, timezone and timeline.');
          check(this.days.every(day => !day.hotelRef || Object.hasOwn(this.hotels, day.hotelRef)), 'A day references an unknown hotel.');
          check(unique(this.bookings.map(item => item.id)), 'Booking IDs must be unique.');
          check(unique(this.adminPrepList.map(item => item.id)), 'Prep IDs must be unique.');

          const serialized = JSON.stringify({ days: this.days, bookings: this.bookings, prep: this.adminPrepList });
          check(JSON.stringify(this.days.find(day => day.id === 'day-11')).includes('CX495') && serialized.includes('CX841') && serialized.includes('CX472') && serialized.includes('CX840') && !/CX400|CX443/.test(serialized), 'Booked flights must be CX841 + CX472 (Nov 28–29), CX495 (Dec 8, Taipei → Hong Kong) and CX840 (Dec 13).');
          const dayText = id => JSON.stringify(this.days.find(day => day.id === id) || {});
          check(/Maolin/.test(dayText('day-09')) && /Qishan/.test(dayText('day-09')) && !serialized.includes('7329') && !/Shenmu/.test(serialized), 'Day 9 must be the Maolin / Qishan charter day; the Alishan plan is gone.');
          check(/Ten Drum/.test(dayText('day-08')) && /3:00 PM/.test(dayText('day-08')) && /Wusheng/.test(dayText('day-08')), 'Day 8 must be Ten Drum (3:00 PM drum show) and Wusheng Night Market.');
          check(/Bus 21/.test(dayText('day-14')) && /Bus 11/.test(dayText('day-14')) && /Pak Kung Au/.test(dayText('day-14')), 'Lantau Peak / Bus 21 / Bus 11 anchors are missing.');
          check(serialized.includes('5:30 PM') && serialized.includes('Aqua Luna'), 'Aqua Luna sailing anchor is missing.');
          check(this.days.filter(day => /NARA/.test(JSON.stringify(day.timeline))).map(day => day.id).join() === 'day-05' && !this.days.slice(10).some(day => /massage/i.test(JSON.stringify(day.timeline))), 'NARA on Day 5 must be the only scheduled massage, with none in Hong Kong.');
          check(this.days.filter(day => /Michelin-Star/i.test(JSON.stringify(day.timeline.map(i => i.title)))).map(day => day.id).join() === 'day-15' && /Joy Hing/.test(dayText('day-12')) && /Ho Hung Kee/.test(dayText('day-12')), 'Food plan: Yat Tung Heen (Day 15) is the one starred meal; Day 12 lunch is Joy Hing with Ho Hung Kee as the backup.');
          check(/Christmas/.test(dayText('day-06')) && /Qingshan/.test(dayText('day-03')) && /Chrysanthemum/.test(dayText('day-04')) && /International Jockeys/.test(dayText('day-12')) && /WTT/.test(dayText('day-13')) && /Brands/.test(dayText('day-15')), 'A dated event dropped out of the plan.');
          check(!this.days.some(day => day.timeline.some(item => /Lotus Pond|Chikan|Chihkan|Hayashi|Anping|Peak Tram|Gym Pod|Chopstick|Alishan|Ngong Ping 360|Xiaoyoukeng/i.test(item.title))), 'A cut item is back as a timeline stop.');
          check(this.days.every(day => day.timeline.every(item => item.startAt || Number.isFinite(this.parseTimelineStartMinutes(item.time)))), 'A timeline item has no readable start time, so the live plan cannot place it.');
          check(this.bookings.some(item => item.id === 'b-23'), 'Taiwan repeat-visitor draw eligibility check is missing.');
          check(!document.querySelector('details, summary'), 'Accordions are not allowed.');
          check(document.documentElement.dataset.appearance === 'dark' && this.appearance === 'dark', 'The app is dark only, but it resolved to another appearance.');
          check([...Object.values(this.destinationPhotos), ...Object.values(this.dayPhotos)].every(p => p.src && p.credit?.author && p.credit?.license && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(p.credit.page)), 'A destination photo is missing its author, license or source page.');
          check(this.days.every(day => this.dayPhotos[day.id] || ['taipei', 'kaohsiung', 'hk', 'flight'].includes(this.getDayTheme(day))), 'A day has no hero photo.');

          for (const day of this.days) {
            let lastStart = -1;
            for (const item of day.timeline) {
              if (item.startAt) continue;
              const start = this.parseTimelineStartMinutes(item.time);
              if (!Number.isFinite(start)) continue;
              check(start >= lastStart, `${day.id} timeline is not chronological near ${item.title}.`);
              lastStart = Math.max(lastStart, start);
              const end = this.parseTimelineEndMinutes(item.time);
              check(!Number.isFinite(end) || end >= start, `${day.id} has an end before its start near ${item.title}.`);
            }
          }

          // Japan-parity features.
          check(Object.values(this.hotels).every(hotel => hasCjk(hotel.nameTc) && hasCjk(hotel.addressTc)), 'A hotel has no Chinese name or address for the Show card.');
          check(this.days.every(day => day.id === 'day-01' || (this.sunForDay(day) && this.sunForDay(day).riseMin > 6 * 60 && this.sunForDay(day).riseMin < 7 * 60 + 10 && this.sunForDay(day).setMin > 16 * 60 + 55 && this.sunForDay(day).setMin < 17 * 60 + 50)), 'A day is missing a plausible sunrise/sunset.');
          check(!this.sunForDay(this.days[0]) && this.sunForDay(this.days.find(d => d.id === 'day-04'))?.setPlace === 'Tamsui', 'Sun places are wrong (flight day, or the Tamsui sunset).');
          check(this.sunForDay(this.days.find(d => d.id === 'day-12'))?.rise === '6:51 AM' && this.sunForDay(this.days.find(d => d.id === 'day-12'))?.set === '5:40 PM', 'Hong Kong Dec 9 sun times drifted from the Observatory table (6:51 / 17:40).');
          check(this.bookingsForDay(this.days.find(d => d.id === 'day-07')).some(b => b.id === 'b-02') && !this.bookingsForDay(this.days.find(d => d.id === 'day-02')).some(b => b.id === 'b-23'), 'Bookings are not matched to their day.');
          check(/Airline Inn/.test(this.tomorrowPreview(this.days.find(d => d.id === 'day-06'))?.text || '') && this.tomorrowPreview(this.days[this.days.length - 1]) === null, 'Tomorrow preview is missing the hotel move, or runs past the last day.');
          check(this.mapUrlFor('google', '台北 101') === 'https://www.google.com/maps/dir/?api=1&destination=%E5%8F%B0%E5%8C%97%20101' && this.mapUrlFor('apple', 'A&B') === 'https://maps.apple.com/?daddr=A%26B', 'Directions links are malformed.');
          check(this.sanitizeCustomBookings([{ id: 'custom-a', title: 'X', eventDate: 'Thu, Dec 03' }, { id: 'b-02', title: 'spoof' }, { id: 'custom-b', title: '' }, 'junk', { id: 'custom-a', title: 'dup' }]).length === 1 && this.sanitizeCustomPrep([{ id: 'custom-prep-a', title: 'Y' }, { id: 'ap-1', title: 'spoof' }]).length === 1, 'Your own bookings/tasks are not sanitised.');
          check(Object.keys(this.sanitizeBookingRefs({ 'b-02': ' ABC123 ', 'nope': 'X', 'b-03': 5 })).join() === 'b-02' && this.sanitizeBookingRefs({ 'b-02': ' ABC123 ' })['b-02'] === 'ABC123', 'Booking codes are not sanitised.');
          check(['tel:110', 'tel:119', 'tel:0800011765', 'tel:999'].every(href => document.querySelector(`a[href="${href}"]`)), 'Emergency numbers are missing from Tools.');
          check(!this.isSimulated && this.clockNow() - Date.now() < 1000, 'Preview mode is on at launch.');

          const duplicateIds = [...document.querySelectorAll('[id]')]
            .map(element => element.id)
            .filter((id, index, all) => id && all.indexOf(id) !== index);
          check(duplicateIds.length === 0, `Duplicate DOM IDs: ${[...new Set(duplicateIds)].join(', ')}`);

          this.semanticQa = { passed: issues.length === 0, checks, issues };
          window.__TWHK_QA__ = this.semanticQa;
          if (issues.length) console.warn('[trip QA]', issues);
          else console.info(`[trip QA] ${checks}/${checks} checks passed`);
        },

        /*
          Swipe the hero left/right to step days. Scoped to the hero card only — a
          full-page horizontal handler steals vertical scroll, and the day rail below is
          itself a horizontal scroller that must keep its own gestures.

          Horizontal intent is enforced by CSS (`touch-action: pan-y` on the hero) rather
          than preventDefault: the browser keeps vertical panning native and only hands
          over sideways movement, so a diagonal thumb-scroll can never be swallowed. The
          thresholds below are a second guard for slow or ambiguous drags.

          Additive, never the only way: the day rail stays the visible control, which is
          what both the HIG and the swipe-affordance guidance require of any gesture.
        */
        onHeroTouchStart(event) {
          if (!event.touches || event.touches.length !== 1) { this._heroSwipe = null; return; }
          const touch = event.touches[0];
          this._heroSwipe = { x: touch.clientX, y: touch.clientY, at: Date.now() };
        },

        onHeroTouchEnd(event) {
          const start = this._heroSwipe;
          this._heroSwipe = null;
          if (!start || !event.changedTouches || !event.changedTouches.length) return;
          const touch = event.changedTouches[0];
          const dx = touch.clientX - start.x;
          const dy = touch.clientY - start.y;
          if (Math.abs(dx) < 56) return;              // too short to be deliberate
          if (Math.abs(dx) < Math.abs(dy) * 1.6) return; // too diagonal — treat as a scroll
          if (Date.now() - start.at > 600) return;    // too slow — treat as a drag, not a flick
          this.switchRelativeDay(dx < 0 ? 1 : -1);    // drag left reveals the next day
        },

        /* ---------- Global itinerary search ----------
           Answers "which day is this on?" without scrolling sixteen days by hand.

           Every record here is bilingual, so the corpus must carry the *Tc fields or a
           Chinese query silently finds nothing. normalizeSearchValue is NFKC + lowercase +
           whitespace collapse, all of which leave CJK untouched, so one code path serves
           both scripts. */
        normalizeSearchValue(value) {
          return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
        },

        getSearchLocationLabel(day) {
          // Unlike the sibling build, which scrapes place names out of a title, these
          // records already carry clean bilingual labels.
          return String(day?.shortLabel || day?.city || '').trim();
        },

        buildDaySearchSources(day) {
          // The itinerary is static for the lifetime of the page, so a day's corpus only
          // ever needs building once.
          if (!this._searchSourceCache) this._searchSourceCache = new Map();
          const cached = this._searchSourceCache.get(day.id);
          if (cached) return cached;

          const sources = [];
          const push = (kind, label, text, weight, targetKind = 'day-summary', eventIndex = null, primary = true) => {
            const cleanLabel = String(label || '').trim();
            const cleanText = extractSearchText(text || label).trim();
            if (!cleanText) return;
            sources.push({ kind, label: cleanLabel || cleanText.slice(0, 100), text: cleanText, weight, targetKind, eventIndex, primary });
          };

          push('day', day.title, [day.title, day.titleTc, day.city, day.shortLabel, day.dateString], 112);
          push('hotel', `Base · ${day.hotelRef || day.city}`, [day.hotelRef, day.city], 80);
          push('transit', 'Transit', day.transitSummary, 70);
          push('food', 'Food', [day.foodRecommendation, day.proteinPlan], 68);

          (day.timeline || []).forEach((item, index) => {
            const label = `${item.time ? item.time + ' · ' : ''}${item.title || 'Timeline activity'}`;
            push('event', label,
              [item.time, item.title, item.titleTc, item.navigateTo, item.addressTc, item.guide, item.notes],
              96, 'event', index);
            if (item.details) {
              const d = item.details;
              push('event', label, [d.highlights, d.tips, d.getThere, d.hours], 58, 'event', index, false);
            }
          });

          // Prose stays searchable but secondary, so a passing mention in a rain plan never
          // outranks the day something is actually scheduled on.
          push('note', 'Insider tip', day.insiderTip, 52, 'day-summary', null, false);
          push('note', 'Easy plan', day.easyPlan, 48, 'day-summary', null, false);
          push('note', 'Rain plan', day.rainPlan, 46, 'day-summary', null, false);
          push('note', 'Backups', day.backups, 44, 'day-summary', null, false);
          push('note', 'Weather', day.weatherExpected, 40, 'day-summary', null, false);

          this._searchSourceCache.set(day.id, sources);
          return sources;
        },

        searchItinerary(query) {
          // Match from the start of a word first, so "nba" finds NBA ATELIER and not
          // "unbagged", "pinball" or "sunbathe". Only when that finds nothing does it fall
          // back to matching inside words (e.g. "shan" for Yangmingshan).
          const strict = this.searchItineraryBy(query, false);
          return strict.length ? strict : this.searchItineraryBy(query, true);
        },

        searchItineraryBy(query, loose) {
          const normalized = this.normalizeSearchValue(query);
          if (!normalized) return [];
          const tokens = normalized.split(' ').filter(Boolean);
          const results = [];
          const has = (text, token) => {
            if (loose || !/^[a-z0-9]/.test(token)) return text.includes(token);
            let from = 0;
            for (;;) {
              const at = text.indexOf(token, from);
              if (at < 0) return false;
              if (at === 0 || !/[a-z0-9]/.test(text[at - 1])) return true;
              from = at + 1;
            }
          };

          this.days.forEach(day => {
            const sources = this.buildDaySearchSources(day);
            const wholeDay = this.normalizeSearchValue(sources.map(s => s.text).join(' '));
            if (!tokens.every(token => has(wholeDay, token))) return;

            const scored = sources.map(source => {
              const text = this.normalizeSearchValue(source.text);
              const label = this.normalizeSearchValue(source.label);
              const hits = tokens.filter(token => has(text, token)).length;
              if (!hits) return null;
              const matchedAll = tokens.every(token => has(text, token));
              let score = source.weight + hits * 9;
              if (matchedAll) score += 34;
              if (label.includes(normalized)) score += 54;
              if (text.includes(normalized)) score += 28;
              if (tokens.every(token => has(label, token))) score += 18;
              return { ...source, score, matchedAll };
            }).filter(Boolean).sort((a, b) => b.score - a.score);

            if (!scored.length) return;
            const direct = scored.filter(s => s.matchedAll);
            const primaryMatch = direct.some(s => s.primary);
            const ranked = direct.length ? direct : scored;
            const best = ranked[0];
            const matches = [];
            const seen = new Set();
            ranked.forEach(source => {
              if (matches.length >= 2) return;
              const key = this.normalizeSearchValue(source.label);
              if (!key || seen.has(key)) return;
              seen.add(key);
              matches.push({ kind: source.kind, label: source.label });
            });

            results.push({
              dayId: day.id,
              dayNum: day.dayNum,
              dateString: day.dateString,
              city: day.city,
              locationLabel: this.getSearchLocationLabel(day),
              title: day.title,
              score: best.score + (primaryMatch ? 30 : 0),
              primaryMatch,
              targetKind: best.targetKind,
              eventIndex: best.eventIndex,
              detailsMatch: best.targetKind === 'event' && best.primary === false,
              matches
            });
          });

          const hasPrimary = results.some(r => r.primaryMatch);
          return results
            .filter(r => !hasPrimary || r.primaryMatch)
            .sort((a, b) => b.score - a.score || String(a.dayNum).localeCompare(String(b.dayNum)))
            .slice(0, 12);
        },

        get globalSearchResults() {
          // Alpine getters are not memoised and the overlay template reads this six times
          // per render. Unmemoised, that is seven full scans per keystroke — the exact
          // defect the sibling build shipped with. The itinerary never changes at runtime,
          // so the query string is a complete cache key.
          const query = this.globalSearchQuery;
          if (this._searchResultsKey !== query) {
            this._searchResultsKey = query;
            this._searchResultsValue = this.searchItinerary(query);
          }
          return this._searchResultsValue;
        },

        openGlobalSearch(seed = '') {
          if (typeof seed === 'string' && seed.trim()) this.globalSearchQuery = seed;
          // iOS raises the keyboard only for a focus() made inside the tap itself, and the real
          // field is still display:none here. Focus a stand-in now; moving focus from one text
          // field to another below keeps the keyboard up.
          const proxy = document.getElementById('search-focus-proxy');
          try { proxy?.focus({ preventScroll: true }); } catch (_) {}
          this.showGlobalSearch = true;
          document.documentElement.classList.add('global-search-open');
          this.watchSearchViewport(true);
          this.$nextTick(() => {
            this.refreshIcons();
            // $nextTick alone is too early: x-show has flipped the style but the element
            // has not painted yet, and focus() on a not-yet-visible node is a no-op.
            requestAnimationFrame(() => {
              const input = document.getElementById('global-itinerary-search');
              if (!this.showGlobalSearch || !input) {
                if (document.activeElement === proxy) proxy.blur();
                return;
              }
              input.focus({ preventScroll: true });
              const end = input.value.length;
              try { input.setSelectionRange(end, end); } catch (_) {}
            });
          });
        },

        // The keyboard shrinks the visual viewport, not the layout viewport that fixed elements
        // use, so the sheet is fitted to visualViewport while search is open.
        watchSearchViewport(active) {
          const viewport = window.visualViewport;
          if (!viewport) return;
          if (this._searchViewportFit) {
            viewport.removeEventListener('resize', this._searchViewportFit);
            viewport.removeEventListener('scroll', this._searchViewportFit);
            this._searchViewportFit = null;
          }
          const backdrop = document.querySelector('.global-search-backdrop');
          if (!active) {
            backdrop?.style.removeProperty('--search-vv-top');
            backdrop?.style.removeProperty('--search-vv-height');
            backdrop?.classList.remove('has-keyboard');
            return;
          }
          this._searchViewportFit = () => this.fitSearchToViewport();
          viewport.addEventListener('resize', this._searchViewportFit);
          viewport.addEventListener('scroll', this._searchViewportFit);
          this.fitSearchToViewport();
        },

        fitSearchToViewport() {
          const viewport = window.visualViewport;
          const backdrop = document.querySelector('.global-search-backdrop');
          if (!viewport || !backdrop) return;
          backdrop.style.setProperty('--search-vv-top', `${Math.max(0, Math.round(viewport.offsetTop))}px`);
          backdrop.style.setProperty('--search-vv-height', `${Math.round(Math.min(viewport.height, window.innerHeight))}px`);
          // The home-indicator inset sits behind the keyboard while it is up.
          backdrop.classList.toggle('has-keyboard', window.innerHeight - viewport.height > 120);
        },

        closeGlobalSearch() {
          if (!this.showGlobalSearch) return;
          this.showGlobalSearch = false;
          document.documentElement.classList.remove('global-search-open');
          this.watchSearchViewport(false);
          this.$nextTick(() => {
            const phoneTrigger = window.matchMedia('(max-width: 767px)').matches ? document.querySelector('.mobile-search-item') : null;
            (phoneTrigger || document.getElementById('global-search-trigger'))?.focus({ preventScroll: true });
          });
        },

        setGlobalSearch(term) {
          this.globalSearchQuery = term;
          this.$nextTick(() => document.getElementById('global-itinerary-search')?.focus({ preventScroll: true }));
        },

        // This is the only modal in the build, so there is no shared trap to reuse. Keeping
        // Tab inside the panel is what makes it a real dialog rather than an overlay that
        // quietly hands focus to the page behind it.
        trapSearchFocus(event) {
          const panel = document.querySelector('[data-modal-panel="search"]');
          if (!panel) return;
          const focusable = [...panel.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')]
            .filter(el => !el.disabled && el.getBoundingClientRect().height > 0);
          if (!focusable.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        },

        openGlobalSearchResult(result) {
          if (!result) return;
          this.closeGlobalSearch();
          this.switchTab('today', true);
          const positionPlan = { targetKind: result.targetKind, eventIndex: result.eventIndex };
          this.selectDayFromStrip(result.dayId, positionPlan);
          this.$nextTick(() => window.setTimeout(() => {
            this.positionRelevantPlan(positionPlan, 'auto');
            this.flashSearchTarget(positionPlan.targetKind === 'event' ? `timeline-item-${positionPlan.eventIndex}` : 'day-summary');
          }, 100));
        },

        switchRelativeDay(delta) {
          const idx = this.days.findIndex(day => day.id === this.activeDayId);
          if (idx < 0) return;
          const next = Math.max(0, Math.min(this.days.length - 1, idx + delta));
          if (next === idx) return;
          this.selectDayFromStrip(this.days[next].id);
          this.$nextTick(() => document.getElementById('chip-' + this.activeDayId)?.focus({ preventScroll: true }));
        },

        getScheduleMinutes(nowValue, timeZone) {
          try {
            const parts = new Intl.DateTimeFormat('en-US', {
              timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
            }).formatToParts(new Date(nowValue));
            const hour = Number(parts.find(p => p.type === 'hour')?.value);
            const minute = Number(parts.find(p => p.type === 'minute')?.value);
            const second = Number(parts.find(p => p.type === 'second')?.value);
            return [hour, minute, second].every(Number.isFinite) ? hour * 60 + minute + second / 60 : NaN;
          } catch (error) {
            return NaN;
          }
        },

        parseTimelineClock(token) {
          const match = String(token || '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
          if (!match) return NaN;
          let hour = Number(match[1]) % 12;
          const minute = Number(match[2] || 0);
          if (match[3].toUpperCase() === 'PM') hour += 12;
          return hour * 60 + minute;
        },

        parseTimelineStartMinutes(text) {
          return this.parseTimelineClock(text);
        },

        parseTimelineEndMinutes(text) {
          const matches = [...String(text || '').matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi)];
          if (matches.length < 2) return NaN;
          const end = this.parseTimelineClock(matches[matches.length - 1][0]);
          const start = this.parseTimelineClock(matches[0][0]);
          // "9:00 PM – 12:00 AM" runs past midnight: an end before the start belongs to the next day.
          return Number.isFinite(start) && Number.isFinite(end) && end < start ? end + 1440 : end;
        },

        resolveRelevantPlan(nowValue = this.clockNow()) {
          const now = Number(nowValue);
          const dayId = this.getLiveTripDayId(now);
          const day = this.days.find(candidate => candidate.id === dayId);
          if (!day) return null;
          const items = day.timeline || [];
          const tripEnd = new Date('2026-12-13T19:05:00-05:00').getTime();

          for (let index = 0; index < items.length; index++) {
            const item = items[index];
            if (!('startAt' in item) && !('endAt' in item)) continue;
            const start = new Date(item.startAt).getTime();
            const end = new Date(item.endAt).getTime();
            if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
              return { day, targetKind: 'summary', state: 'next', label: 'UP NEXT' };
            }
            const includesTripEnd = day.id === 'day-16' && index === items.length - 1 && now === tripEnd;
            if (now >= start && (now < end || includesTripEnd)) {
              return { day, targetKind: 'event', eventIndex: index, state: 'current', label: 'CURRENT' };
            }
          }

          const minutes = this.getScheduleMinutes(now, day.timeZone);
          if (!Number.isFinite(minutes)) return { day, targetKind: 'summary', state: 'next', label: 'UP NEXT' };

          for (let index = 0; index < items.length; index++) {
            const item = items[index];
            if (item.startAt && item.endAt) {
              const start = new Date(item.startAt).getTime();
              if (Number.isFinite(start) && now < start) {
                return { day, targetKind: 'event', eventIndex: index, state: 'next', label: 'UP NEXT' };
              }
              continue;
            }

            const start = this.parseTimelineStartMinutes(item.time);
            if (!Number.isFinite(start)) return { day, targetKind: 'summary', state: 'next', label: 'UP NEXT' };
            if (minutes < start) return { day, targetKind: 'event', eventIndex: index, state: 'next', label: 'UP NEXT' };

            const explicitEnd = this.parseTimelineEndMinutes(item.time);
            const nextStart = index + 1 < items.length ? this.parseTimelineStartMinutes(items[index + 1].time) : NaN;
            const end = Number.isFinite(explicitEnd)
              ? Math.min(explicitEnd, Number.isFinite(nextStart) ? nextStart : explicitEnd)
              : Number.isFinite(nextStart) ? nextStart : start + 120;
            const hasGapAfterExplicitEnd = Number.isFinite(explicitEnd) && Number.isFinite(nextStart) && explicitEnd < nextStart;
            if (minutes < end || (hasGapAfterExplicitEnd && minutes === explicitEnd)) {
              return { day, targetKind: 'event', eventIndex: index, state: 'current', label: 'CURRENT' };
            }
          }

          return { day, targetKind: 'complete', state: 'complete', label: 'DAY COMPLETE' };
        },

        isCurrentTimelineItem(idx) {
          return idx === this.currentTimelineIndex;
        },

        timelineItemPast(idx) {
          const live = this.liveTripDayId;
          if (!live) return !this.isPreTrip;
          const order = id => this.days.findIndex(day => day.id === id);
          const viewing = order(this.activeDayId);
          const today = order(live);
          if (viewing !== today) return viewing < today;
          const plan = this.relevantPlan;
          if (!plan || plan.day?.id !== live) return false;
          if (plan.targetKind === 'complete') return true;
          return plan.targetKind === 'event' && idx < plan.eventIndex;
        },

        timelineItemState(idx) {
          return this.isCurrentTimelineItem(idx) ? this.relevantPlan.state : '';
        },

        timelineItemLabel(idx) {
          return this.isCurrentTimelineItem(idx) ? this.relevantPlan.label : '';
        },

        timelineAccessibleLabel(item, idx) {
          const label = this.timelineItemLabel(idx);
          const past = !label && this.timelineItemPast(idx) ? 'Done' : '';
          return [label, past, item.time, item.title].filter(Boolean).join('. ');
        },

        scrollToCurrentTimeline() {
          this.openLiveContext();
        },

        locateRelevantPlan() {
          this.openLiveContext();
        },

        openDay(dayId) {
          if (!dayId || !this.days.some(day => day.id === dayId)) return;
          this.smartLaunchActive = false;
          this.setMotionDirection(
            this.days.findIndex(day => day.id === this.activeDayId),
            this.days.findIndex(day => day.id === dayId)
          );
          this.tabScrollPositions[this.activeTab] = window.scrollY || 0;
          this.activeDayId = dayId;
          this.activeTab = 'today';
          this.tabScrollPositions.today = 0;
          this.$nextTick(() => {
            requestAnimationFrame(() => {
              this.positionRelevantPlan({ targetKind: 'day-summary' }, 'auto');
            });
          });
          this.playDayChange();
        },

        determineCurrentDay() {
          const liveId = this.liveTripDayId;
          this.lastLiveTripDayId = liveId;
          const savedDay = getStorage('twhk_active_day_v10', null);
          const validSavedDay = this.days.some(day => day.id === savedDay) ? savedDay : null;

          if (liveId) {
            this.activeDayId = this.hasExplicitNavigation() ? (validSavedDay || liveId) : liveId;
          } else if (validSavedDay) {
            this.activeDayId = validSavedDay;
          } else {
            this.activeDayId = 'day-02';
          }
        },

        hasExplicitNavigation() {
          if (history.state?.smartLaunchGenerated === true) return false;
          const query = new URLSearchParams(location.search);
          const tab = query.get('tab');
          const day = query.get('day');
          // ./?tab=today is the Home Screen start URL: a plain launch, which opens on today. A day,
          // or another tab, is a real deep link (a reload after an update, a shared link).
          return ['itinerary', 'plan', 'toolkit'].includes(tab)
            || this.days.some(candidate => candidate.id === day);
        },

        shouldSmartLaunch() {
          return Boolean(this.liveTripDayId && !this.hasExplicitNavigation());
        },

        // Where the pinned header and day rail end once stuck, whether or not they are stuck yet.
        pinnedChromeBottom() {
          return [...document.querySelectorAll('.app-chrome, .day-strip-wrap')]
            .filter(element => element.getClientRects().length && getComputedStyle(element).position === 'sticky')
            .reduce((bottom, element) => {
              const top = parseFloat(getComputedStyle(element).top);
              const pinnedBottom = (Number.isFinite(top) ? top : 0) + element.getBoundingClientRect().height;
              return Math.max(bottom, pinnedBottom);
            }, 0);
        },

        positionRelevantPlan(plan, behavior = 'auto') {
          if (!plan) return;
          const target = this.planTarget(plan);
          if (!target) return;
          const stickyBottom = this.pinnedChromeBottom();
          const targetTop = target.getBoundingClientRect().top + window.scrollY;
          const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          const root = document.documentElement;
          const previousScrollBehavior = root.style.scrollBehavior;
          if (behavior === 'auto') root.style.scrollBehavior = 'auto';
          window.scrollTo({ top: Math.max(0, Math.min(maxScroll, targetTop - stickyBottom - 12)), behavior });
          if (behavior === 'auto') root.style.scrollBehavior = previousScrollBehavior;
        },

        refreshLiveContext(allowRollover = false) {
          const previousLiveId = this.lastLiveTripDayId;
          const wasFollowingLiveDay = Boolean(previousLiveId && this.activeDayId === previousLiveId && this.activeTab === 'today');
          this.nowTick = this.clockNow();
          const plan = this.resolveRelevantPlan(this.nowTick);
          const nextLiveId = plan?.day?.id || null;
          this.relevantPlan = plan;
          this.lastLiveTripDayId = nextLiveId;
          this.updateCountdown();
          this.updateAppBadge();
          this.maybeNotifyLeaveBy();
          if (allowRollover && wasFollowingLiveDay && nextLiveId && nextLiveId !== previousLiveId) {
            this.activeTab = 'today';
            this.activeDayId = nextLiveId;
            // The new day from its top (the Now card), as a launch would show it. A live move made
            // since (a resume, a tap on the Now card) wins over this one.
            const seq = this._liveMoveSeq;
            this.$nextTick(() => window.setTimeout(() => requestAnimationFrame(() => { if (this._liveMoveSeq === seq) this.showLiveTop(); }), 60));
          }
        },

        updateCountdown() {
          const now = this.nowTick;
          const tripStartEpoch = new Date('2026-11-28T06:15:00-05:00').getTime();
          const tripEndEpoch = new Date('2026-12-13T19:05:00-05:00').getTime();

          if (now < tripStartEpoch) {
            const diffDays = Math.ceil((tripStartEpoch - now) / (1000 * 60 * 60 * 24));
            const nyDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            this.countdownText = nyDay(now) === nyDay(tripStartEpoch) ? 'Departs today' : `${diffDays} ${diffDays === 1 ? 'day' : 'days'} to go`;
          } else if (now <= tripEndEpoch) {
            const liveId = this.liveTripDayId;
            if (liveId) {
              const day = this.days.find(d => d.id === liveId);
              this.countdownText = day ? `Day ${Number(day.dayNum)} of ${this.days.length}` : 'Trip live';
            } else {
              this.countdownText = 'Trip Live';
            }
          } else {
            this.countdownText = 'Trip Complete';
          }
        },

        escapeDisplayHtml(value) {
          return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        },

        formatHeroTitle(value) {
          return this.escapeDisplayHtml(value)
            // The no-break space goes before the arrow, so a wrapped line ends with "→" and never
            // starts with it (or with a stray space). ASCII "->" arrives escaped as "-&gt;".
            .replace(/\s*(?:\u2794|→|-&gt;)\s*/g, '&nbsp;<span class="route-arrow" aria-hidden="true">→</span> ')
            .replace(/\s+&amp;\s+/g, '<span class="title-separator" aria-hidden="true">·</span>');
        },

        getDayTheme(day) {
          if (day?.hotelRef === 'hk') return 'hk';
          if (day?.hotelRef === 'kaohsiung') return 'kaohsiung';
          if (day?.hotelRef === 'taipei') return 'taipei';
          return 'flight';
        },

        getTimelineTone(item) {
          const icon = String(item?.icon || '').toLowerCase();
          const title = String(item?.title || '').toLowerCase();
          if (['utensils', 'store', 'shopping-bag'].includes(icon) || /breakfast|lunch|dinner|snack|dessert|food|market|bakery|tea|coffee/.test(title)) return 'tone-food';
          if (['train', 'bus', 'car', 'plane', 'plane-landing', 'plane-takeoff', 'ship', 'luggage', 'navigation'].includes(icon)) return 'tone-transit';
          if (['dumbbell', 'footprints', 'waves', 'backpack'].includes(icon) || /hike|walk|gym|climb|trail|race/.test(title)) return 'tone-active';
          if (['bath', 'heart-pulse', 'flower'].includes(icon) || /massage|spa|recovery|bath/.test(title)) return 'tone-wellness';
          if (['landmark', 'building-2', 'camera', 'hammer', 'eye'].includes(icon)) return 'tone-culture';
          return 'tone-default';
        },

        parseMonthDay(textValue, fallbackYear = 2026) {
          const raw = String(textValue || '');
          const months = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
          const match = raw.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
          if (!match) return null;
          const month = months[match[1].slice(0,3).toLowerCase()];
          const day = Number(match[2]);
          const year = Number(match[3] || fallbackYear);
          if (!month || !Number.isInteger(day) || day < 1 || day > 31 || !Number.isInteger(year)) return null;
          return { year, month, day };
        },

        makeTaipeiEpoch(parts, hour = 9, minute = 0) {
          if (!parts) return NaN;
          const iso = `${parts.year}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+08:00`;
          const parsed = new Date(iso);
          return Number.isNaN(parsed.getTime()) ? NaN : parsed.getTime();
        },

        getBookingEventEpoch(item) {
          return this.makeTaipeiEpoch(this.parseMonthDay(item?.eventDate));
        },

        getBookingActionVerb(item) {
          const raw = String(item?.openDate || '').toLowerCase();
          if (/check|target|watch/.test(raw)) return 'Check';
          if (/confirm/.test(raw) && !/book/.test(raw)) return 'Confirm';
          return 'Book';
        },

        isImmediateBookingAction(item) {
          const raw = String(item?.openDate || '').toLowerCase();
          return /immediate|open now|book.*ahead|confirm ahead/.test(raw);
        },

        getBookingOpenEpoch(item) {
          const raw = String(item?.openDate || '').trim();
          const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?/);
          if (iso) {
            return this.makeTaipeiEpoch({ year:Number(iso[1]), month:Number(iso[2]), day:Number(iso[3]) }, Number(iso[4] ?? 9), Number(iso[5] ?? 0));
          }

          const namedDate = this.parseMonthDay(raw);
          if (namedDate) {
            const time = raw.match(/\b(\d{1,2}):(\d{2})\b/);
            return this.makeTaipeiEpoch(namedDate, Number(time?.[1] ?? 9), Number(time?.[2] ?? 0));
          }

          if (/1\s*week\s*ahead/i.test(raw)) {
            const eventEpoch = this.getBookingEventEpoch(item);
            return Number.isFinite(eventEpoch) ? eventEpoch - (7 * 86400000) : NaN;
          }
          return NaN;
        },

        getBookingSortKey(item) {
          if (this.isImmediateBookingAction(item)) return -1;
          const epoch = this.getBookingOpenEpoch(item);
          if (Number.isFinite(epoch)) return epoch;
          const raw = String(item?.openDate || '').toLowerCase();
          if (/target|check|watch|by/.test(raw)) return Number.MAX_SAFE_INTEGER - 1000;
          return Number.MAX_SAFE_INTEGER;
        },

        getBookingState(item) {
          if (this.bookedIds.includes(item.id)) return 'done';
          if (this.isImmediateBookingAction(item)) return 'now';
          const epoch = this.getBookingOpenEpoch(item);
          if (Number.isFinite(epoch)) {
            const days = Math.ceil((epoch - this.nowTick) / 86400000);
            if (days <= 0) return 'now';
            if (days <= 14) return 'soon';
            return 'upcoming';
          }
          return 'check';
        },

        getBookingStatusLabel(item) {
          const state = this.getBookingState(item);
          const verb = this.getBookingActionVerb(item);
          if (state === 'done') return 'Done';
          if (state === 'now') return `${verb} now`;
          if (state === 'soon' || state === 'upcoming') return this.getBookingReleaseLabel(item.openDate, item);
          return `${verb} / watch`;
        },

        getBookingStatusClass(item) {
          return `status-${this.getBookingState(item)}`;
        },

        canExportBookingReminder(item) {
          return Number.isFinite(this.getBookingOpenEpoch(item));
        },

        exportBookingReminder(item) {
          const startMs = this.getBookingOpenEpoch(item);
          if (!Number.isFinite(startMs)) {
            this.showToast('No exact reminder date available');
            return;
          }
          const endMs = startMs + 30 * 60 * 1000;
          const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
          const esc = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
          const description = [item.notes, item.cost, item.url].filter(Boolean).join('\n');
          const ics = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Taiwan + Hong Kong 2026//Booking Reminder//EN',
            'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${item.id}-${startMs}@twhk26.local`,
            `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(startMs)}`, `DTEND:${stamp(endMs)}`,
            `SUMMARY:${esc(this.getBookingActionVerb(item) + ': ' + item.title)}`, `DESCRIPTION:${esc(description)}`, 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${esc(this.getBookingActionVerb(item) + ': ' + item.title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'
          ].join('\r\n');
          const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
          this.deliverFile(blob, `taiwan_hong_kong_2026_${item.id}_booking_reminder.ics`, 'Calendar reminder exported', 'Calendar reminder ready');
        },

        getPrepCategory(task) {
          const value = `${task?.title || ''} ${task?.note || ''}`.toLowerCase();
          if (/arrival card|twac|passport|immigration/.test(value)) return 'Entry';
          if (/esim|mobile|number|app|openpoint|fam|ride-hailing/.test(value)) return 'Connectivity';
          if (/octopus|transit|taxi/.test(value)) return 'Transit';
          if (/hotel|voucher|keys/.test(value)) return 'Lodging';
          if (/gym|wellness/.test(value)) return 'Wellness';
          return 'Prep';
        },

        // Dark only. Kept so older backups that carry an appearance preference still import.
        setAppearance() {
          this.appearance = 'dark';
          this.applyAppearance();
        },

        applyAppUpdate() {
          if (this.appUpdateAvailable) window.dispatchEvent(new Event('twhk-apply-update'));
        },

        applyAppearance() {
          document.documentElement.dataset.appearance = 'dark';
          this.syncThemeColor();
        },

        syncThemeColor() {
          const meta = document.querySelector('meta[name="theme-color"]');
          if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--browser-chrome').trim();
        },

        getBookingReleaseLabel(openDate, item = null) {
          const raw = String(openDate || '').trim();
          const booking = item || { openDate: raw };
          const verb = this.getBookingActionVerb(booking);
          if (!raw || this.isImmediateBookingAction(booking)) return `${verb} now`;

          const epoch = this.getBookingOpenEpoch(booking);
          if (!Number.isFinite(epoch)) return raw;

          try {
            const target = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date(epoch));
            const current = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(new Date(this.nowTick || Date.now()));
            const toUtc = value => {
              const [year, month, day] = value.split('-').map(Number);
              return Date.UTC(year, month - 1, day);
            };
            const diffDays = Math.round((toUtc(target) - toUtc(current)) / 86400000);
            if (!Number.isFinite(diffDays) || diffDays <= 0) return `${verb} now`;
            if (diffDays === 1) return `${verb} tomorrow`;
            return `${verb} in ${diffDays}d`;
          } catch (error) {
            return raw;
          }
        },

        getHotelLabel(day) {
          if (!day.hotelRef) return 'In flight';
          const hotel = this.hotels[day.hotelRef];
          return hotel ? hotel.name : 'In flight';
        },

        scrollActiveDayChip(attempt = 0) {
          const el = document.getElementById('chip-' + this.activeDayId);
          const strip = document.getElementById('day-strip');
          if (!el || !strip) return;
          if (!strip.getClientRects().length || !el.getClientRects().length) {
            // Today is hidden or still appearing; try again for a few frames (the tab watcher
            // centres it whenever Today is shown later).
            const tries = typeof attempt === 'number' ? attempt : 0;
            if (tries < 8) requestAnimationFrame(() => this.scrollActiveDayChip(tries + 1));
            return;
          }
          const itemRect = el.getBoundingClientRect();
          const stripRect = strip.getBoundingClientRect();
          const offset = (itemRect.left + itemRect.width / 2) - (stripRect.left + strip.clientLeft + strip.clientWidth / 2);
          const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
          const left = Math.max(0, Math.min(max, strip.scrollLeft + offset));
          if (Math.abs(left - strip.scrollLeft) < 0.5) return;
          // Instant, never smooth: on iOS the next tap would first stop the motion and be discarded.
          strip.scrollTo({ left, behavior: 'auto' });
        },

        toggleDayCompleted(dayId) {
          if (!this.days.some(day => day.id === dayId)) return;
          if (this.completedDayIds.includes(dayId)) {
            this.completedDayIds = this.completedDayIds.filter(id => id !== dayId);
            this.showToast('Day marked active');
          } else {
            this.completedDayIds.push(dayId);
            this.showToast('Day marked completed');
          }
          setStorage('twhk_completed_days_v10', JSON.stringify(this.completedDayIds));
          this.refreshIcons();
        },

        toggleBooked(bookingId) {
          if (!this.bookings.some(item => item.id === bookingId)) return;
          if (this.bookedIds.includes(bookingId)) {
            if (this.bookingRefs[bookingId]) {
              if (!window.confirm('Mark as not booked and remove its booking code?')) return;
              const refs = { ...this.bookingRefs }; delete refs[bookingId]; this.bookingRefs = refs;
              setStorage('twhk_booking_refs_v1', JSON.stringify(this.bookingRefs));
            }
            this.bookedIds = this.bookedIds.filter(id => id !== bookingId);
            this.showToast('Booking marked pending');
          } else {
            this.bookedIds.push(bookingId);
            this.showToast('Booking marked completed');
          }
          setStorage('twhk_booked_ids_v10', JSON.stringify(this.bookedIds));
          this.refreshIcons();
          this.updateAppBadge();
        },

        toggleAdminPrep(taskId) {
          if (!this.adminPrepList.some(item => item.id === taskId)) return;
          if (this.adminPrepDoneIds.includes(taskId)) {
            this.adminPrepDoneIds = this.adminPrepDoneIds.filter(id => id !== taskId);
          } else {
            this.adminPrepDoneIds.push(taskId);
          }
          setStorage('twhk_admin_prep_ids_v10', JSON.stringify(this.adminPrepDoneIds));
          this.refreshIcons();
          this.updateAppBadge();
        },

        async refreshExchangeRates(force = false) {
          const cacheKey = 'twhk_fx_rates_v1';
          const cached = getStorage(cacheKey, null);
          const maxAgeMs = 6 * 60 * 60 * 1000;

          if (!force && cached?.savedAt && (Date.now() - Number(cached.savedAt) < maxAgeMs) && cached?.rates?.TWD && cached?.rates?.HKD) {
            this.currencyRates = { USD: 1, TWD: Number(cached.rates.TWD), HKD: Number(cached.rates.HKD) };
            this.fx.source = 'cached';
            this.fx.rateDate = cached.rateDate || null;
            this.fx.savedAt = Number(cached.savedAt);
            return;
          }

          this.fx.loading = true;
          try {
            const fetchRate = async (quote) => {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 6000);
              try {
                const response = await fetch(`https://api.frankfurter.dev/v2/rate/USD/${quote}`, {
                  cache: 'no-store',
                  signal: controller.signal
                });
                if (!response.ok) throw new Error(`FX ${quote}: ${response.status}`);
                const data = await response.json();
                const rate = Number(data.rate);
                if (!Number.isFinite(rate) || rate <= 0) throw new Error(`FX ${quote}: invalid rate`);
                return { rate, date: data.date || null };
              } finally {
                clearTimeout(timeout);
              }
            };

            const [twd, hkd] = await Promise.all([fetchRate('TWD'), fetchRate('HKD')]);
            const rateDate = [twd.date, hkd.date].filter(Boolean).sort().pop() || null;
            const savedAt = Date.now();
            this.currencyRates = { USD: 1, TWD: twd.rate, HKD: hkd.rate };
            this.fx.source = 'live';
            this.fx.rateDate = rateDate;
            this.fx.savedAt = savedAt;
            setStorage(cacheKey, JSON.stringify({
              rates: { TWD: twd.rate, HKD: hkd.rate },
              rateDate,
              savedAt
            }));
            if (force) this.showToast('Exchange rates refreshed');
          } catch (error) {
            if (cached?.rates?.TWD && cached?.rates?.HKD) {
              this.currencyRates = { USD: 1, TWD: Number(cached.rates.TWD), HKD: Number(cached.rates.HKD) };
              this.fx.source = 'cached';
              this.fx.rateDate = cached.rateDate || null;
              this.fx.savedAt = Number(cached.savedAt || 0);
            } else {
              this.fx.source = 'fallback';
              this.fx.rateDate = null;
            }
            if (force) this.showToast('Using cached/offline FX rates');
          } finally {
            this.fx.loading = false;
          }
        },

        formatUsdEstimate(amountUsd) {
          const value = Number(amountUsd);
          if (!Number.isFinite(value)) return '';
          const digits = value < 10 ? 2 : 0;
          return `US$${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
        },

        withUsdConversion(text) {
          if (text === null || text === undefined) return '';
          const raw = String(text);
          if (!raw.includes('NT$') && !raw.includes('HK$')) return raw;
          return raw.replace(/(NT\$|HK\$)\s*([0-9][0-9,]*(?:\.[0-9]+)?)(?:\s*([–-])\s*(?:(?:NT\$|HK\$)\s*)?([0-9][0-9,]*(?:\.[0-9]+)?))?/g, (match, symbol, first, dash, second) => {
            const code = symbol === 'NT$' ? 'TWD' : 'HKD';
            const rate = Number(this.currencyRates[code]);
            if (!Number.isFinite(rate) || rate <= 0) return match;
            const a = Number(first.replace(/,/g, ''));
            if (!Number.isFinite(a)) return match;
            const firstUsd = this.formatUsdEstimate(a / rate);
            if (second) {
              const b = Number(second.replace(/,/g, ''));
              if (!Number.isFinite(b)) return `${match} (~${firstUsd})`;
              const secondUsd = this.formatUsdEstimate(b / rate);
              return `${match} (~${firstUsd}–${secondUsd})`;
            }
            return `${match} (~${firstUsd})`;
          });
        },

        formatCurrency(amountUsd) {
          const rate = this.currencyRates[this.selectedCurrency] || 1;
          const converted = Math.round(amountUsd * rate);
          if (this.selectedCurrency === 'USD') return `$${converted.toLocaleString()}`;
          if (this.selectedCurrency === 'TWD') return `NT$${converted.toLocaleString()}`;
          return `HK$${converted.toLocaleString()}`;
        },

        getLocalCopyText(item) {
          if (!item) return '';
          const parts = [];
          const title = (item.titleTc || item.nameTc || '').trim();
          if (title) parts.push(title);

          if (item.addressTc) {
            const address = item.addressTc.trim();
            if (!title || !address.includes(title)) {
              parts.push(address);
            } else if (address !== title) {
              return address;
            }
          }

          if (!parts.length && item.navigateTo) {
            parts.push(item.navigateTo.trim());
          }

          return parts.filter(Boolean).join('\n');
        },

        getLocalCopyToast(item) {
          if (!item) return 'Copied';
          const hasTitle = Boolean(item.titleTc || item.nameTc);
          const hasAddress = Boolean(item.addressTc);
          if (hasTitle && hasAddress) return 'Local destination copied';
          if (hasTitle) return 'Local name copied';
          if (hasAddress) return 'Address copied';
          return 'Destination copied';
        },

        // Home-screen icon badge. Pre-trip it mirrors the T-Xd countdown already in the
        // header; during the trip it mirrors openPlanCount, the exact figure already shown
        // in the Plan tab (outstanding bookings + prep tasks) — reusing the existing figure
        // rather than inventing a new "critical items" concept. No permission prompt.
        updateAppBadge() {
          if (this.isSimulated || !('setAppBadge' in navigator)) return;
          try {
            const tripEndEpoch = new Date('2026-12-13T19:05:00-05:00').getTime();
            if (this.isPreTrip) {
              const tripStartEpoch = new Date('2026-11-28T06:15:00-05:00').getTime();
              const diffDays = Math.max(0, Math.ceil((tripStartEpoch - this.nowTick) / (1000 * 60 * 60 * 24)));
              navigator.setAppBadge(diffDays).catch(() => {});
            } else if (this.nowTick <= tripEndEpoch) {
              const openCount = this.openPlanCount;
              if (openCount > 0) navigator.setAppBadge(openCount).catch(() => {});
              else navigator.clearAppBadge().catch(() => {});
            } else {
              navigator.clearAppBadge().catch(() => {});
            }
          } catch (_) { /* badge is cosmetic; never let it throw into app logic */ }
        },

        // Live countdown to today's leave-by time, only while today IS the live trip day —
        // showing it on a day you're merely browsing would misrepresent a countdown as
        // urgent when it isn't actionable yet. leaveByTime is free text with the clock time
        // embedded ("At JFK by 6:15 AM", "9:30 AM from hotel") — parseTimelineClock is the
        // same helper the timeline itself already uses for this exact shape, so this adds
        // no new parsing risk. getScheduleMinutes is timezone-aware per day (this trip spans
        // America/New_York on the flight day and Asia/Taipei / Asia/Hong_Kong afterward) —
        // using a single hardcoded timezone here would silently mis-time the JFK day.
        computeLeaveByCountdownForDay(day) {
          if (!day || !day.leaveByTime || day.id !== this.liveTripDayId) return null;
          const targetMinutes = this.parseTimelineClock(day.leaveByTime);
          if (!Number.isFinite(targetMinutes)) return null;
          const nowMinutes = this.getScheduleMinutes(this.nowTick, day.timeZone);
          if (!Number.isFinite(nowMinutes)) return null;
          // Whole minutes, rounded up as the Now card's "Nm left" is ("Leave in 1 min" until it is
          // time). The schedule clock carries seconds, which printed "Leave in 17.383333333333326 min".
          const minutesLeft = Math.ceil(targetMinutes - nowMinutes - 1e-9) || 0;

          // More than 90 minutes out: the static fact-card value is enough. More than 15 minutes
          // past it the moment has gone (it used to read "600m past leave-by" all evening).
          if (minutesLeft > 90 || minutesLeft < -15) return null;

          let urgency = 'calm';
          if (minutesLeft <= 0) urgency = 'now';
          else if (minutesLeft <= 10) urgency = 'urgent';
          else if (minutesLeft <= 30) urgency = 'soon';

          const label = minutesLeft <= 0
            ? (minutesLeft === 0 ? 'Leave now' : `${Math.abs(minutesLeft)} min late`)
            : (minutesLeft >= 60 ? `Leave in ${Math.floor(minutesLeft / 60)} h ${String(minutesLeft % 60).padStart(2, '0')}` : `Leave in ${minutesLeft} min`);

          return { minutesLeft, urgency, label, key: `${day.id}:${targetMinutes}` };
        },

        get activeLeaveByCountdown() {
          return this.computeLeaveByCountdownForDay(this.currentDay);
        },

        // Fires exactly once per leave-by instance, independent of what the user is
        // currently viewing — a leave-by alert exists specifically to reach you when you're
        // NOT on the relevant screen, so this always checks the LIVE day, not currentDay.
        maybeNotifyLeaveBy() {
          if (this.isSimulated) return;
          const liveDay = this.days.find(d => d.id === this.liveTripDayId);
          const countdown = this.computeLeaveByCountdownForDay(liveDay);
          if (!countdown || (countdown.urgency !== 'now' && countdown.urgency !== 'urgent')) return;
          if (this._notifiedLeaveByKey === countdown.key) return;
          this._notifiedLeaveByKey = countdown.key;
          if (!('Notification' in window) || Notification.permission !== 'granted') return;
          try {
            const body = countdown.minutesLeft <= 0 ? `Leave now — ${liveDay.leaveByTime}` : `${countdown.label} — ${liveDay.leaveByTime}`;
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
              navigator.serviceWorker.ready.then(reg => reg.showNotification("Taiwan & HK '26", { body, tag: 'leave-by', icon: './icon-192.png' })).catch(() => {});
            } else {
              new Notification("Taiwan & HK '26", { body, tag: 'leave-by' });
            }
          } catch (_) { /* notification is a supplementary nudge, never load-bearing */ }
        },

        // 'default' (not yet asked) is the only state worth offering a button for: 'granted'
        // needs no button, and 'denied' cannot be re-requested from script.
        canOfferLeaveByAlerts() {
          return 'Notification' in window && Notification.permission === 'default';
        },

        enableLeaveByAlerts() {
          if (!('Notification' in window)) { this.showToast('Notifications are not supported in this browser'); return; }
          if (Notification.permission === 'granted') { this.showToast('Leave-by alerts are already on'); return; }
          Notification.requestPermission().then(perm => {
            this.notificationState = perm;
            this.showToast(perm === 'granted' ? 'Leave-by alerts enabled' : 'Notifications permission was not granted');
          }).catch(() => {});
        },

        copyText(text, successMessage) {
          if (!text) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
              .then(() => this.showToast(successMessage))
              .catch(() => this.fallbackCopy(text, successMessage));
          } else {
            this.fallbackCopy(text, successMessage);
          }
        },

        fallbackCopy(text, successMessage) {
          try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            this.showToast(successMessage);
          } catch (e) {
            this.showToast('Unable to copy');
          }
        },

        showToast(message, tone = 'success') {
          const id = Date.now();
          this.toasts.push({ id, message, tone });
          this.$nextTick(() => this.refreshIcons());
          setTimeout(() => {
            this.toasts = this.toasts.filter(t => t.id !== id);
          }, 2400);
        },

        notifyStorageFailure() {
          if (this.storageWarningShown) return;
          this.storageWarningShown = true;
          this.showToast('Changes are not being saved — use Backup data before closing.', 'warning');
        },

        persistUserState() {
          setStorage('twhk_completed_days_v10', JSON.stringify(this.completedDayIds));
          setStorage('twhk_booked_ids_v10', JSON.stringify(this.bookedIds));
          setStorage('twhk_admin_prep_ids_v10', JSON.stringify(this.adminPrepDoneIds));
          setStorage('twhk_active_day_v10', JSON.stringify(this.activeDayId));
          setStorage('twhk_plan_view_v20', JSON.stringify(this.planView));
          setStorage('twhk_currency_v23', JSON.stringify(this.selectedCurrency));
          setStorage('twhk_booking_refs_v1', JSON.stringify(this.bookingRefs));
          setStorage('twhk_map_provider_v1', JSON.stringify(this.mapProvider));
          this.persistCustomItems();
        },

        buildStatePayload() {
          return {
            version: 25,
            exportedAt: new Date().toISOString(),
            activeDayId: this.activeDayId,
            planView: this.planView,
            selectedCurrency: this.selectedCurrency,
            completedDayIds: this.sanitizeIdList(this.completedDayIds, this.days.map(day => day.id)),
            bookedIds: this.sanitizeIdList(this.bookedIds, this.bookings.map(item => item.id)),
            adminPrepDoneIds: this.sanitizeIdList(this.adminPrepDoneIds, this.adminPrepList.map(item => item.id)),
            bookingRefs: this.sanitizeBookingRefs(this.bookingRefs),
            customBookings: this.customBookingsForSave(),
            customPrep: this.customPrepForSave(),
            mapProvider: this.mapProvider,
            bringTicks: this.bringTicks && typeof this.bringTicks === 'object' ? this.bringTicks : {}
          };
        },

        exportState() {
          const blob = new Blob([JSON.stringify(this.buildStatePayload(), null, 2)], { type: 'application/json' });
          this.deliverFile(blob, `taiwan_hong_kong_2026_user_state_${new Date().toISOString().slice(0,10)}.json`, 'Backup downloaded', 'Backup ready to save');
        },

        // A download in a Home Screen app opens a preview with no way back except force-quitting
        // the app (WebKit bug 290847). There, hand the file to the share sheet instead, from
        // inside the tap and as a file only. Safari tabs and desktops keep the download.
        deliverFile(blob, filename, downloadedMessage, sharedMessage) {
          const installed = navigator.standalone === true;
          if (installed && typeof navigator.share === 'function' && typeof File === 'function') {
            const file = new File([blob], filename, { type: blob.type });
            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
              navigator.share({ files: [file] })
                .then(() => this.showToast(sharedMessage))
                .catch(error => { if (error?.name !== 'AbortError') this.showToast('Unable to share the file', 'warning'); });
              return;
            }
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 600);
          this.showToast(downloadedMessage);
        },

        async importStateFile(event) {
          const input = event?.target;
          const file = input?.files?.[0];
          if (!file) return;
          try {
            if (file.size > 50 * 1024 * 1024) throw new Error('Backup file is too large');
            const parsed = JSON.parse(await file.text());
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid backup');
            // Your own bookings and tasks first, so their booked/done marks survive the sanitising below.
            if (Array.isArray(parsed.customBookings) || Array.isArray(parsed.customPrep)) {
              const keepBookings = Array.isArray(parsed.customBookings) ? parsed.customBookings : this.customBookingsForSave();
              const keepPrep = Array.isArray(parsed.customPrep) ? parsed.customPrep : this.customPrepForSave();
              this.mergeCustomItems(keepBookings, keepPrep);
            }
            if (parsed.bookingRefs && typeof parsed.bookingRefs === 'object') this.bookingRefs = this.sanitizeBookingRefs(parsed.bookingRefs);
            if (['apple', 'google'].includes(parsed.mapProvider)) this.mapProvider = parsed.mapProvider;

            this.completedDayIds = this.sanitizeIdList(parsed.completedDayIds, this.days.map(day => day.id));
            this.bookedIds = this.sanitizeIdList(parsed.bookedIds, this.bookings.map(item => item.id));
            this.adminPrepDoneIds = this.sanitizeIdList(parsed.adminPrepDoneIds, this.adminPrepList.map(item => item.id));
            if (this.days.some(day => day.id === parsed.activeDayId)) {
              this.smartLaunchActive = false;
              this.activeDayId = parsed.activeDayId;
            }
            if (['bookings', 'prep'].includes(parsed.planView)) this.planView = parsed.planView;
            if (['USD', 'TWD', 'HKD'].includes(parsed.selectedCurrency)) this.selectedCurrency = parsed.selectedCurrency;
            if (parsed.bringTicks && typeof parsed.bringTicks === 'object' && !Array.isArray(parsed.bringTicks)) {
              this.bringTicks = Object.fromEntries(Object.entries(parsed.bringTicks).filter(([key, value]) => /^day-\d{2}:[a-z]+$/.test(key) && value === true));
              setStorage('twhk_bring_ticks_v1', JSON.stringify(this.bringTicks));
            }
            // Older backups have no ticketPhotos; photos merge by id and are never deleted here.
            const photoResult = Array.isArray(parsed.ticketPhotos) && typeof this.importTicketPhotos === 'function' ? await this.importTicketPhotos(parsed.ticketPhotos) : { restored: 0, failed: 0 };
            const photosRestored = photoResult.restored || 0;
            const photosFailed = photoResult.failed || 0;
            this.persistUserState();
            this.syncThemeColor();
            this.refreshIcons();
            this.$nextTick(() => this.scrollActiveDayChip(true));
            const photoText = photosRestored ? ` with ${photosRestored} ticket photo${photosRestored === 1 ? '' : 's'}` : '';
            const failText = photosFailed ? ` · ${photosFailed} photo${photosFailed === 1 ? '' : 's'} couldn't be restored` : '';
            this.showToast(`Backup restored${photoText}${failText}`, photosFailed ? 'warning' : undefined);
          } catch (error) {
            this.showToast('Invalid backup file');
          } finally {
            if (input) input.value = '';
          }
        },

        // ---------- Clock + preview mode ----------
        clockNow() {
          return Date.now() + (Number(this.simOffsetMs) || 0);
        },

        get isSimulated() {
          return Number(this.simOffsetMs) !== 0;
        },

        get anyModalOpen() {
          return this.showGlobalSearch || Boolean(this.showSheet);
        },

        applySimulatedTime() {
          const match = String(this.simInput || '').trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
          const target = match ? Date.parse(`${match[1]}T${match[2]}:00+08:00`) : NaN;
          if (!Number.isFinite(target)) { this.showToast('Pick a date and time to preview', 'warning'); return; }
          if (!this.isSimulated) this._preSimDayId = this.activeDayId;
          this.simOffsetMs = (target - Date.now()) || 1;
          this.refreshLiveContext(false);
          if (this.liveTripDayId) this.activeDayId = this.liveTripDayId;
          this.showToast(this.liveTripDayId ? `Previewing ${this.countdownText}` : `Previewing · ${this.countdownText}`);
        },

        resetToLiveTime(quiet = false) {
          if (!this.isSimulated) return;
          this.simOffsetMs = 0;
          this.refreshLiveContext(false);
          this.updateAppBadge();
          const restore = this.liveTripDayId || this._preSimDayId;
          this._preSimDayId = null;
          if (this.days.some(day => day.id === restore)) this.activeDayId = restore;
          if (!quiet) this.showToast('Back to the real time');
        },

        // ---------- Directions ----------
        mapUrlFor(provider, destination) {
          const q = encodeURIComponent(String(destination || '').trim());
          return provider === 'apple' ? `https://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
        },

        mapUrl(destination) {
          return this.mapUrlFor(this.mapProvider, destination);
        },

        setMapProvider(provider) {
          this.mapProvider = provider === 'apple' ? 'apple' : 'google';
          setStorage('twhk_map_provider_v1', JSON.stringify(this.mapProvider));
          this.showToast(`Directions open in ${this.mapProvider === 'apple' ? 'Apple Maps' : 'Google Maps'}`);
        },

        // ---------- Sun ----------
        formatMinutesClock(minutes) {
          if (!Number.isFinite(minutes)) return '';
          const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
          return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
        },

        sunForDay(day) {
          const places = SUN_PLACES[day?.id];
          const date = this.parseMonthDay(day?.dateString);
          if (!places || !date) return null;
          const [morning, evening] = places.map(key => SUN_COORDS[key]);
          const riseMin = sunMinutes(date.year, date.month, date.day, morning[0], morning[1], true);
          const setMin = sunMinutes(date.year, date.month, date.day, evening[0], evening[1], false);
          const base = SUN_COORDS[day.hotelRef === 'hk' ? 'hk' : day.hotelRef || 'taipei'];
          return {
            riseMin, setMin,
            rise: this.formatMinutesClock(riseMin), set: this.formatMinutesClock(setMin),
            risePlace: morning[2] !== base?.[2] ? morning[2] : '',
            setPlace: evening[2] !== base?.[2] ? evening[2] : ''
          };
        },

        sunText(day) {
          const sun = this.sunForDay(day);
          if (!sun) return '';
          return `Sunrise ${sun.rise}${sun.risePlace ? ' in ' + sun.risePlace : ''} · Sunset ${sun.set}${sun.setPlace ? ' at ' + sun.setPlace : ''}`;
        },

        // Tomorrow's first stop, a hotel move and the sunrise: what the travellers check at night.
        tomorrowPreview(day) {
          const index = this.days.findIndex(candidate => candidate.id === day?.id);
          const next = index >= 0 ? this.days[index + 1] : null;
          if (!next) return null;
          const first = next.timeline?.[0];
          const start = first ? this.clockBounds(first.time).start : '';
          const move = next.hotelRef && next.hotelRef !== day.hotelRef ? this.hotels[next.hotelRef]?.name : '';
          const sun = this.sunForDay(next);
          const parts = [`Tomorrow${start ? ' ' + start : ''} · ${first?.title || next.title}`];
          if (move) parts.push(`moving to ${move}`);
          if (sun?.rise) parts.push(`sunrise ${sun.rise}`);
          return { text: parts.join(' · '), dayId: next.id };
        },

        // ---------- Bookings on the day ----------
        bookingsForDay(day) {
          const date = this.parseMonthDay(day?.dateString);
          if (!date) return [];
          return this.bookings.filter(item => {
            if (item.onDay === false) return false;
            const parts = this.parseMonthDay(item.eventDate);
            return Boolean(parts && parts.month === date.month && parts.day === date.day);
          }).sort((a, b) => (this.parseTimelineStartMinutes(this.bookingTimeText(a)) || 0) - (this.parseTimelineStartMinutes(this.bookingTimeText(b)) || 0));
        },

        bookingTimeText(item) {
          const match = String(item?.eventDate || '').match(/\(([^)]*)\)/);
          return match ? match[1].trim() : '';
        },

        bookingRef(item) {
          return String(this.bookingRefs?.[item?.id] || '');
        },

        sanitizeBookingRefs(value) {
          const ids = new Set([...this.bookings.map(item => item.id), ...(this.flights || []).map(flight => flight.id)]);
          const out = {};
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [id, ref] of Object.entries(value)) {
              if (ids.has(id) && typeof ref === 'string' && ref.trim()) out[id] = ref.trim().slice(0, 80);
            }
          }
          return out;
        },

        // ---------- Your own bookings and tasks ----------
        sanitizeCustomBookings(list) {
          return (Array.isArray(list) ? list : [])
            .filter(item => item && typeof item === 'object' && /^custom-[a-z0-9]+$/.test(String(item.id || '')) && String(item.title || '').trim())
            .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index)
            .slice(0, 60)
            .map(item => ({
              id: String(item.id), custom: true, title: String(item.title).trim().slice(0, 120), titleTc: '',
              eventDate: String(item.eventDate || '').trim().slice(0, 80), openDate: 'Added by you', cost: '',
              notes: String(item.notes || '').trim().slice(0, 600)
            }));
        },

        sanitizeCustomPrep(list) {
          return (Array.isArray(list) ? list : [])
            .filter(item => item && typeof item === 'object' && /^custom-prep-[a-z0-9]+$/.test(String(item.id || '')) && String(item.title || '').trim())
            .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index)
            .slice(0, 60)
            .map(item => ({ id: String(item.id), custom: true, title: String(item.title).trim().slice(0, 120), note: String(item.note || '').trim().slice(0, 400) }));
        },

        mergeCustomItems(bookings, prep) {
          const customBookings = this.sanitizeCustomBookings(bookings);
          const customPrep = this.sanitizeCustomPrep(prep);
          this.bookings = [...this.bookings.filter(item => !item.custom), ...customBookings];
          this.adminPrepList = [...this.adminPrepList.filter(item => !item.custom), ...customPrep];
        },

        customBookingsForSave() {
          return this.bookings.filter(item => item.custom).map(({ id, title, eventDate, notes }) => ({ id, title, eventDate, notes }));
        },

        customPrepForSave() {
          return this.adminPrepList.filter(item => item.custom).map(({ id, title, note }) => ({ id, title, note }));
        },

        persistCustomItems() {
          setStorage('twhk_custom_bookings_v1', JSON.stringify(this.customBookingsForSave()));
          setStorage('twhk_custom_prep_v1', JSON.stringify(this.customPrepForSave()));
        },

        newCustomId(prefix) {
          return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
        },

        openAddBooking(opener = null) {
          this.sheetForm = { title: '', dayId: this.activeDayId, time: '', ref: '', notes: '' };
          this.openSheet('booking', opener);
        },

        saveCustomBooking() {
          const form = this.sheetForm || {};
          const title = String(form.title || '').trim();
          if (!title) { this.showToast('Add a name for the booking', 'warning'); return; }
          if (this.bookings.filter(item => item.custom).length >= 60) { this.showToast('That’s 60 of your own bookings, the most it keeps', 'warning'); return; }
          const day = this.days.find(candidate => candidate.id === form.dayId) || this.currentDay;
          const date = String(day?.dateString || '').replace(/,\s*\d{4}$/, '');
          const time = String(form.time || '').trim().slice(0, 40);
          const [item] = this.sanitizeCustomBookings([{ id: this.newCustomId('custom-'), title, eventDate: time ? `${date} (${time})` : date, notes: form.notes }]);
          this.bookings = [...this.bookings, item];
          this.bookedIds = [...this.bookedIds, item.id];
          const ref = String(form.ref || '').trim();
          if (ref) this.bookingRefs = { ...this.bookingRefs, [item.id]: ref.slice(0, 80) };
          this.persistUserState();
          this.updateAppBadge();
          this.closeSheet();
          this.showToast('Booking added');
        },

        removeCustomBooking(id) {
          const item = this.bookings.find(candidate => candidate.id === id && candidate.custom);
          if (!item || !window.confirm(`Remove “${item.title}”?`)) return;
          this.bookings = this.bookings.filter(candidate => candidate.id !== id);
          this.bookedIds = this.bookedIds.filter(candidate => candidate !== id);
          const refs = { ...this.bookingRefs }; delete refs[id]; this.bookingRefs = refs;
          this.persistUserState();
          this.updateAppBadge();
          this.showToast('Booking removed');
          this.$nextTick(() => document.querySelector('#plan-panel-bookings .plan-add-row .data-action')?.focus({ preventScroll: true }));
        },

        openAddPrep(opener = null) {
          this.sheetForm = { title: '', note: '' };
          this.openSheet('prep', opener);
        },

        saveCustomPrep() {
          const title = String(this.sheetForm?.title || '').trim();
          if (!title) { this.showToast('Add a name for the task', 'warning'); return; }
          if (this.adminPrepList.filter(item => item.custom).length >= 60) { this.showToast('That’s 60 of your own tasks, the most it keeps', 'warning'); return; }
          const [item] = this.sanitizeCustomPrep([{ id: this.newCustomId('custom-prep-'), title, note: this.sheetForm.note }]);
          this.adminPrepList = [...this.adminPrepList, item];
          this.persistUserState();
          this.updateAppBadge();
          this.closeSheet();
          this.showToast('Task added');
        },

        removeCustomPrep(id) {
          const item = this.adminPrepList.find(candidate => candidate.id === id && candidate.custom);
          if (!item || !window.confirm(`Remove “${item.title}”?`)) return;
          this.adminPrepList = this.adminPrepList.filter(candidate => candidate.id !== id);
          this.adminPrepDoneIds = this.adminPrepDoneIds.filter(candidate => candidate !== id);
          this.persistUserState();
          this.updateAppBadge();
          this.showToast('Task removed');
          this.$nextTick(() => document.querySelector('#plan-panel-prep .plan-add-row .data-action')?.focus({ preventScroll: true }));
        },

        openRefSheet(item, opener = null) {
          if (!item) return;
          this.sheetForm = { id: item.id, title: item.title, ref: this.bookingRef(item) };
          this.openSheet('ref', opener);
        },

        // A saved code means the booking exists, so it is marked booked too.
        saveBookingRef() {
          const id = this.sheetForm?.id;
          const isFlight = (this.flights || []).some(flight => flight.id === id);
          if (!isFlight && !this.bookings.some(item => item.id === id)) { this.closeSheet(); return; }
          const ref = String(this.sheetForm.ref || '').trim().slice(0, 80);
          const refs = { ...this.bookingRefs };
          if (ref) refs[id] = ref; else delete refs[id];
          this.bookingRefs = refs;
          if (ref && !isFlight && !this.bookedIds.includes(id)) this.bookedIds = [...this.bookedIds, id];
          this.persistUserState();
          this.updateAppBadge();
          this.closeSheet();
          this.showToast(ref ? 'Booking code saved' : 'Booking code removed');
        },

        // ---------- Sheets + Show card ----------
        openSheet(kind, opener = null) {
          this._sheetOpener = opener?.isConnected ? opener : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
          // iOS raises the keyboard only for a focus() made inside the tap; the field does not exist yet.
          const proxy = ['ref', 'booking', 'prep', 'import'].includes(kind) ? document.getElementById('search-focus-proxy') : null;
          try { proxy?.focus({ preventScroll: true }); } catch (_) {}
          this.sheetView = kind;
          this.showSheet = kind;
          this.watchSheetViewport(kind !== 'show');
          this.$nextTick(() => requestAnimationFrame(() => {
            const panel = document.querySelector('[data-modal-panel="sheet"]');
            if (this.showSheet !== kind || !panel) { if (document.activeElement === proxy) proxy.blur(); return; }
            (panel.querySelector('[data-autofocus]') || panel.querySelector('input, select, textarea, button'))?.focus({ preventScroll: true });
          }));
        },

        watchSheetViewport(active) {
          const viewport = window.visualViewport;
          if (!viewport) return;
          if (this._sheetViewportFit) {
            viewport.removeEventListener('resize', this._sheetViewportFit);
            viewport.removeEventListener('scroll', this._sheetViewportFit);
            this._sheetViewportFit = null;
          }
          const backdrop = document.querySelector('.sheet-backdrop');
          if (!active) {
            backdrop?.style.removeProperty('--sheet-vv-top');
            backdrop?.style.removeProperty('--sheet-vv-height');
            return;
          }
          this._sheetViewportFit = () => {
            if (!backdrop) return;
            backdrop.style.setProperty('--sheet-vv-top', `${Math.max(0, Math.round(viewport.offsetTop))}px`);
            backdrop.style.setProperty('--sheet-vv-height', `${Math.round(Math.min(viewport.height, window.innerHeight))}px`);
          };
          viewport.addEventListener('resize', this._sheetViewportFit);
          viewport.addEventListener('scroll', this._sheetViewportFit);
          this._sheetViewportFit();
        },

        closeSheet() {
          if (!this.showSheet) return;
          this.releaseWakeLock();
          this.watchSheetViewport(false);
          this.showSheet = null;
          const opener = this._sheetOpener;
          this._sheetOpener = null;
          this.$nextTick(() => { if (opener?.isConnected) opener.focus({ preventScroll: true }); });
        },

        trapSheetFocus(event) {
          const panel = document.querySelector('[data-modal-panel="sheet"]');
          if (!panel) return;
          const focusable = [...panel.querySelectorAll('a[href], button:not([disabled]), input, select, textarea')].filter(el => el.getClientRects().length);
          if (!focusable.length) return;
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        },

        canShowPlace(item) {
          return Boolean(item && !item.noMap && (item.navigateTo || item.addressTc) && (hasCjk(item.titleTc || item.nameTc) || hasCjk(item.addressTc) || hasCjk(item.navigateTo)));
        },

        placeShowData(item, lang = 'zh-TW') {
          const local = hasCjk(item?.titleTc || item?.nameTc) ? String(item.titleTc || item.nameTc).trim() : '';
          const address = hasCjk(item?.addressTc) ? String(item.addressTc).trim() : (hasCjk(item?.navigateTo) ? String(item.navigateTo).trim() : '');
          return { kind: 'place', title: String(item?.title || item?.name || '').trim(), local, address: address && address !== local ? address : '', ref: '', when: '', lang };
        },

        bookingShowData(item) {
          return { kind: 'booking', title: item.title, local: hasCjk(item.titleTc) ? item.titleTc : '', address: '', ref: this.bookingRef(item), when: item.eventDate, lang: 'zh-Hant', bookingId: item.id };
        },

        // Show (給對方看): the local name and address, or a booking code, at counter size on a paper-white
        // sheet, with the screen kept awake. The wake lock needs the tap itself, so it is asked for first.
        openShowCard(data, opener = null) {
          if (!data || !(data.local || data.address || data.ref || data.title)) return;
          this.showCardData = data;
          this.requestWakeLock();
          this.openSheet('show', opener);
        },

        requestWakeLock() {
          if (!navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') return;
          navigator.wakeLock.request('screen').then(lock => {
            if (this.showSheet !== 'show') { lock.release().catch(() => {}); return; }
            if (this._wakeLock && this._wakeLock !== lock) this._wakeLock.release().catch(() => {});
            this._wakeLock = lock;
          }).catch(() => {});
        },

        releaseWakeLock() {
          const lock = this._wakeLock;
          this._wakeLock = null;
          if (lock) lock.release().catch(() => {});
        },

        // ---------- Device ----------
        async checkOfflineReady() {
          try {
            if (!('caches' in window)) return;
            const key = (await caches.keys()).find(name => name.startsWith('twhk-field-'));
            if (!key) return;
            this.offlineReady = Boolean(await (await caches.open(key)).match(new URL('./index.html', location.href).href));
          } catch (_) { /* informational only */ }
        },

        // iOS may evict Cache Storage under pressure; a persisted grant (favoured for Home Screen apps)
        // keeps the offline copy through a photo-heavy trip.
        requestPersistentStorage() {
          try {
            const installed = navigator.standalone === true || Boolean(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
            if (installed && navigator.storage && navigator.storage.persist) {
              navigator.storage.persisted().then(granted => granted || navigator.storage.persist()).catch(() => {});
            }
          } catch (_) {}
        },

        // ---------- Search highlights ----------
        // Painted with the CSS Custom Highlight API (Safari 17.2+): ranges over the existing text nodes, so
        // Alpine's DOM is never rewritten. Unsupported engines simply show plain results.
        paintSearchHighlights() {
          if (!(window.CSS && CSS.highlights && typeof window.Highlight === 'function')) return;
          CSS.highlights.delete('search-hit');
          const query = this.normalizeSearchValue(this.globalSearchQuery);
          const tokens = query.split(' ').filter(token => token.length >= 2 || hasCjk(token));
          const list = document.querySelector('[data-modal-panel="search"] .global-search-results');
          if (!this.showGlobalSearch || !tokens.length || !list) return;
          const ranges = [];
          const walker = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.data.toLowerCase();
            for (const token of tokens) {
              for (let at = text.indexOf(token); at !== -1; at = text.indexOf(token, at + token.length)) {
                const range = new Range();
                range.setStart(node, at);
                range.setEnd(node, at + token.length);
                ranges.push(range);
              }
            }
          }
          if (ranges.length) CSS.highlights.set('search-hit', new Highlight(...ranges));
        },

        flashSearchTarget(id) {
          const target = document.getElementById(id);
          if (!target) return;
          // The timer lives on the element, outside Alpine's reactive state.
          window.clearTimeout(target.__flashTimer);
          target.classList.remove('search-hit-flash');
          void target.offsetWidth;
          target.classList.add('search-hit-flash');
          target.__flashTimer = window.setTimeout(() => target.classList.remove('search-hit-flash'), 1800);
        },

        // Reset: the day, booking and prep marks, booking codes and your own items. Settings,
        // currency and the map choice stay. Asked first, in a sheet that says exactly that.
        openResetSheet(opener = null) {
          this.sheetForm = {};
          this.openSheet('reset', opener);
        },

        resetTripProgress() {
          this.completedDayIds = [];
          this.bookedIds = [];
          this.adminPrepDoneIds = [];
          this.bookingRefs = {};
          this.mergeCustomItems([], []);
          this.persistCustomItems();
          setStorage('twhk_booking_refs_v1', JSON.stringify({}));
          this.persistUserState();
          if (this.activeTab === 'plan') this.freezePlanOrder();
          this.closeSheet();
          this.updateAppBadge();
          this.refreshIcons();
          this.showToast('Trip progress reset');
        },

        refreshIcons() {
          this.$nextTick(() => {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
              window.lucide.createIcons();
              document.querySelectorAll('svg.lucide').forEach((icon) => {
                icon.setAttribute('aria-hidden', 'true');
                icon.setAttribute('focusable', 'false');
              });
            }
          });
        }
      };
    }
