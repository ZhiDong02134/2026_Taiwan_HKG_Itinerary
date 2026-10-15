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
        appearance: (() => {
          const saved = getStorage('twhk_appearance_v1', 'system');
          return ['system', 'light', 'dark'].includes(saved) ? saved : 'system';
        })(),
        selectedCityFilter: 'all',
        activeDayId: 'day-02',
        lastLiveTripDayId: null,
        relevantPlan: null,
        smartLaunchActive: false,
        
        takeItEasyActive: false,
        rainPlanActive: false,
        searchQuery: '',
        selectedCurrency: (() => {
          const saved = getStorage('twhk_currency_v23', 'USD');
          return ['USD', 'TWD', 'HKD'].includes(saved) ? saved : 'USD';
        })(),
        toasts: [],
        storageWarningShown: false,
        nowTick: Date.now(),
        appUpdateAvailable: false,
        semanticQa: { passed: true, checks: 0, issues: [] },
        showGlobalSearch: false,
        globalSearchQuery: '',
        // Deliberately mixed-script: the quick picks double as a hint that Chinese queries
        // work, which is not otherwise discoverable.
        globalSearchSuggestions: ['Jiufen', '九份', 'Alishan', 'Tainan', '夜市', 'Hong Kong'],
        destinationPhotos: {
          taipei: { src: './assets/taipei.webp', label: 'Taipei · 台北', alt: 'Illustrated Taipei skyline with Taipei 101, layered hills and warm city light' },
          kaohsiung: { src: './assets/kaohsiung.webp', label: 'Kaohsiung · 高雄', alt: 'Illustrated Kaohsiung harbour with waterfront towers, cranes and golden water' },
          hk: { src: './assets/hk.webp', label: 'Hong Kong · 香港', alt: 'Illustrated Hong Kong skyline and Victoria Harbour beneath the Peak' }
        },

        get destinationPhoto() {
          const city = this.currentCityTheme === 'flight' ? (Number(this.currentDay.dayNum) > 8 ? 'hk' : 'taipei') : this.currentCityTheme;
          return this.destinationPhotos[city] || this.destinationPhotos.taipei;
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
            nameTc: '豐居旅店 站前館',
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
            title: 'Taiwan Online Arrival Card (TWAC)',
            note: 'Submit online within 7 days before arrival at official NIA site. Paper cards are discontinued; immigration retrieves TWAC electronically upon passport scan.'
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
            title: 'Octopus App for Tourists',
            note: 'Install on iPhone and issue digital Octopus card to Apple Wallet using US Apple Pay.'
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
            id: 'ap-7',
            title: 'Set Up Hong Kong Gym Pod',
            note: 'Only the Thu Dec 10 session remains, and only if HKFIT100 / the live app makes it free or genuinely cheap. Before departure, all 3 travelers install The Gym Pod app and create accounts so guest invitations/door access work. Check the live app around a week ahead; verify the booking window, promo eligibility and exact 3-pax checkout total before confirming.'
          },
          {
            id: 'ap-8',
            title: 'Watch 2026 Asia Winter Baseball League · 留意冬季聯盟',
            note: 'When the official 2026 schedule is published, check Dec 4–7 for a Kaohsiung-area game at Cheng Ching Lake (CCL) or Kaohsiung Li De (KLD). Add a game only if its exact start time cleanly replaces a weaker block; do not compromise Alishan, the fixed Dec 7 massage, or core first-timer anchors.'
          }
        ],

        bookings: [
          {
            id: 'b-23',
            title: 'Return to Taiwan, Double Your Luck — Eligibility Check',
            titleTc: '重遊臺灣・福氣加倍・資格確認與登錄',
            eventDate: 'Taiwan arrival: Sun, Nov 29',
            openDate: 'Open now · register 7–90 days before arrival',
            cost: 'Free',
            url: 'https://5000.taiwan.net.tw/index_en.html',
            notes: 'Check eligibility rather than assuming it: the official campaign requires at least one independent traveler who previously entered Taiwan from Jan 1, 2023 through registration. Each eligible repeat visitor may register one accompanying friend/relative who has not entered Taiwan in that period. Registration for the Nov 29 arrival is already open; mark this complete after either registering or confirming the group is not eligible.'
          },
          {
            id: 'b-20',
            title: 'Taipei Zhongzheng Sports Center — Archery + 10m Air Rifle',
            titleTc: '臺北市中正運動中心・射箭＋10公尺空氣步槍',
            eventDate: 'Thu, Dec 03 (Archery ~10:00 AM • Air Rifle ~1:00 PM)',
            openDate: 'Recheck 48–72h prior',
            cost: 'NT$650/person total',
            notes: 'Local-price sports sampler: archery NT$300 for the first hour including bow/arrows/equipment and basic first-timer instruction; 10m air rifle NT$350/session including 30 pellets, target, rifle and coach. Recheck Thursday operating hours, walk-in rules and same-day capacity 48–72h before travel; do not prepay a tourist package.'
          },
          {
            id: 'b-02',
            title: 'THSR Bullet Train: Taipei ➔ Zuoying',
            titleTc: '台灣高鐵：台北站 → 左營站',
            eventDate: 'Fri, Dec 04 (10:15 AM target)',
            openDate: '2026-11-06',
            cost: 'NT$1,490/person',
            url: 'https://www.thsrc.com.tw/',
            notes: 'Opens 29 days ahead including travel date. Target booking date: Nov 6. Reserved seating.'
          },
          {
            id: 'b-03',
            title: 'THSR Bullet Train: Zuoying ➔ Taoyuan Bypass',
            titleTc: '台灣高鐵：左營站 → 桃園站',
            eventDate: 'Tue, Dec 08 (~10:45–10:55 AM target)',
            openDate: '2026-11-10',
            cost: 'NT$1,330/person',
            url: 'https://www.thsrc.com.tw/',
            notes: 'Opens 29 days ahead including travel date. Target booking date: Nov 10. Direct to Taoyuan.'
          },
          {
            id: 'b-04',
            title: 'Taipei 101 Observatory (89F Sunset Window)',
            titleTc: '台北101觀景台',
            eventDate: 'Thu, Dec 03 (3:45 PM slot)',
            openDate: 'Target check: Nov 03',
            cost: 'NT$600/person',
            url: 'https://www.taipei-101.com.tw/en/observatory',
            notes: 'Target check Nov 3. Sunset is 5:03 PM. Check-in counter at Office Tower 1F.'
          },
          {
            id: 'b-05',
            title: 'Ngong Ping 360 Crystal Cable Car',
            titleTc: '昂坪360',
            eventDate: 'Fri, Dec 11 (10:30–10:45 AM target)',
            openDate: 'Target check: Nov 11',
            cost: 'HK$240/person',
            url: 'https://www.np360.com.hk/',
            notes: 'Weekday service opens at 10:00 AM. With the 9:30 AM hotel departure, target a 10:30–10:45 AM one-way Crystal Cabin from Tung Chung; this still comfortably protects the 1:20 PM Bus 21 to Tai O.'
          },
          {
            id: 'b-06',
            title: 'Aqua Luna Victoria Harbour Sunset Sail',
            titleTc: 'Aqua Luna / 尖沙咀1號公眾碼頭',
            eventDate: 'Sat, Dec 12 (5:30 PM TST Pier 1)',
            openDate: 'Target check: Nov 12',
            cost: 'HK$280/person',
            url: 'https://aqualuna.com.hk/',
            notes: '5:30 PM sailing timed for 5:40 PM winter sunset. 1 free reschedule if requested >=12h prior.'
          },
          {
            id: 'b-19',
            title: 'Yat Tung Heen at Eaton — Optional Finale Reservation',
            titleTc: '逸東軒（Eaton HK）',
            eventDate: 'Sat, Dec 12 (~7:00 PM target)',
            openDate: 'Book / Confirm Ahead',
            cost: 'À la carte / set-menu spend varies',
            url: 'https://www.eatonhk.com/dining/yat-tung-heen/',
            notes: 'Attempt only if the direct booking is free with no deposit, prepayment or card guarantee. If terms are inconvenient or no table is available, keep the same-area Jordan/TST Cantonese/roast-meat fallback instead.'
          },
          {
            id: 'b-07',
            title: 'Grand View Beitou Private Hot Spring Soak',
            titleTc: '北投麗禧溫泉酒店',
            eventDate: 'Tue, Dec 01 (~12:15 PM slot)',
            openDate: 'Check from Nov 01',
            cost: 'NT$3,100 total for 3 (cheapest suitable private room)',
            url: 'https://www.gvrb.com.tw/',
            notes: '90-min private white sulfur bath. The current cheapest suitable private-room pricing is NT$2,500 for 2 + NT$600 for the third adult = NT$3,100 total. Reservations open ~1 month ahead. Confirmed time overrides plan.'
          },
          {
            id: 'b-08',
            title: 'Dihua Chopstick Woodworking (桔物手作)',
            titleTc: '桔物手作',
            eventDate: 'Mon, Nov 30 (Target 10:30 AM • ~1.5h)',
            openDate: 'Book / Confirm Ahead',
            cost: 'NT$800–1,000/person',
            url: 'https://www.pinkoi.com/',
            notes: 'Minyicheng 3F (民生西路362巷34號3樓). Confirm Monday morning slot.'
          },
          {
            id: 'b-09',
            title: 'Shifen & Jiufen Private Hired Van',
            titleTc: '十分 / 金瓜石 / 九份包車',
            eventDate: 'Wed, Dec 02 (9:30 AM – 7:30 PM)',
            openDate: 'Book Ahead',
            cost: '~$105–120 total ($35–40/person)',
            url: 'https://www.klook.com/',
            notes: 'Full-day private van transfer: Shifen Falls → Jinguashi → Jiufen Old Street → Hotel.'
          },
          {
            id: 'b-13',
            title: 'NARA Thai Massage: 120-min Traditional Bodywork',
            titleTc: 'NARA 泰式養生館（東區仁愛店）',
            eventDate: 'Wed, Dec 02 (8:45 PM – 10:45 PM)',
            openDate: 'Book Ahead',
            cost: 'NT$1,299/person',
            url: 'https://line.myfunnow.com/zh-tw/branches/3027568833955',
            notes: 'Traditional Thai compression & stretching (not oil). Book direct/FunNow for 3 simultaneous therapists. Address: 台北市大安區仁愛路四段345巷4弄19號.'
          },
          {
            id: 'b-14',
            title: 'Left Foot / Right Foot: 100-min Acupressure',
            titleTc: '左腳右腳經典按摩會館（新田時尚會館）',
            eventDate: 'Mon, Dec 07 (2:15 PM – 3:55 PM)',
            openDate: 'Book Ahead',
            cost: 'NT$1,700/person',
            url: 'https://www.feet.com.tw/store_info.asp?id=5',
            notes: '100-min full-body acupressure (全身指壓) for 3 men. Direct phone booking (07-282-1377) requested. Address: 高雄市新興區新田路145號.'
          },
          {
            id: 'b-15',
            title: 'The Gym Pod @ Xiqu Centre — Routine Gym',
            titleTc: 'The Gym Pod @ 戲曲中心',
            eventDate: 'Thu, Dec 10 (9:45 AM – 10:45 AM target)',
            openDate: 'Check live app ~1 week ahead',
            cost: 'Live app checkout; HKFIT100 currently advertises first eligible hour free',
            url: 'https://thegympod.hk/xiqu-centre-west-kowloon/',
            notes: 'Book two consecutive 30-min slots in app for 3 pax only if the live checkout is free or genuinely cheap. Official Xiqu page sends users to the live pricing/app rather than publishing a fixed base rate. Verify HKFIT100 eligibility, booking window and exact 3-person total before confirming; otherwise skip the travel-gym block with zero regret.'
          },
          {
            id: 'b-21',
            title: 'Alishan Forest Railway — Shenmu Branch Paper Ticket',
            titleTc: '阿里山林鐵神木線・紙本車票',
            eventDate: 'Sun, Dec 06 (Target 3:40 PM Shenmu → Alishan)',
            openDate: 'Check Fri, Nov 20 at 6:00 AM Taiwan time',
            cost: 'NT$100/person',
            url: 'https://afrch.forest.gov.tw/',
            notes: 'Because Friday sales can open the following weekend, start checking Fri Nov 20 at 6:00 AM Taiwan time for the Dec 6 branch ride. Branch-line travel requires a physical paper ticket; do not rely on an e-ticket. Collect through a Forest Railway station / supported 7-ELEVEN ibon flow as currently instructed. If the 3:40 PM train is unavailable, walk back early and protect the fixed 4:40 PM 7329 bus.'
          },
          {
            id: 'b-22',
            title: 'LOST HK Mong Kok — Escape Room',
            titleTc: 'LOST HK 旺角密室逃脫',
            eventDate: 'Thu, Dec 10 (~12:00 PM • ~80–90 min total)',
            openDate: 'Book / Confirm Ahead',
            cost: 'HK$170/person at current Mon–Thu rate',
            url: 'https://losthk.com/',
            notes: 'Use the Mong Kok branch (3/F, 67–71 Argyle St; near MTR Exit D2) and book a 3-person room. Before paying, message the branch to confirm the selected room can be briefed/supported in Mandarin or English; avoid Cantonese-only wordplay. If language support is not suitable, skip the room rather than forcing a tourist activity.'
          },
          {
            id: 'b-18',
            title: 'Alishan 7329 Reserved Seats + THSR Day Trip',
            titleTc: '阿里山 7329 預約座位 + 高鐵當日來回',
            eventDate: 'Sun, Dec 06 (9:30 AM bus up • 4:40 PM bus down)',
            openDate: 'Sun, Nov 08 at 12:00 AM Taiwan time',
            cost: 'Bus NT$566 RT + THSR ~NT$820 RT/person; forest entry/branch train extra',
            url: 'https://www.taiwantrip.com.tw/Frontend/Route/Select_p?RouteID=R0007',
            notes: 'Critical: buy the SEAT-RESERVATION tickets—not a non-reserved package—in BOTH directions. The current official route page opens reserved seats 29 days before travel, excluding the travel date; for Sun Dec 6, target Sun Nov 8 at 12:00 AM Taiwan time. Check in ≥10 min before each bus; a seat may be released if check-in is not completed by 5 min before departure. Selected timetable: THSR Chiayi 9:30 AM → Alishan 12:00 PM; Alishan 4:40 PM → THSR Chiayi 7:10 PM. This preserves a useful mountain window while avoiding the old 6:50 AM hotel departure. Book matching Zuoying↔Chiayi THSR after exact train times are released.'
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
            transitSummary: 'Cathay Pacific CX841 Nonstop (~16h05 leg)',
            weatherExpected: 'In-flight climate',
            leaveByTime: 'At JFK by 6:15 AM',
            timeline: [
              {
                time: '6:15 AM',
                title: 'Arrive at JFK Terminal 8 (Cathay Pacific Desk)',
                titleTc: '甘迺迪國際機場第八航站樓',
                icon: 'plane-takeoff',
                notes: 'Arrive 6:15 AM for 9:00 AM CX841 departure. Confirm checked bags are tagged through to TPE.',
                navigateTo: 'Terminal 8, John F. Kennedy International Airport, Queens, NY',
                guide: {
                  intro: 'Terminal 8 departure flow for CX841 nonstop to Hong Kong with baggage through-check to Taipei.',
                  steps: [
                    { label: 'Documents', detail: 'Have physical passports and Cathay booking reference ready before reaching desk. Complete TWAC online before departure if within 7-day window; immigration retrieves submission from passport scan.' },
                    { label: 'Through-Check', detail: 'Verify with the Cathay agent that all 3 checked bags are tagged through to TPE (Taipei Taoyuan). If tagged through, they transfer automatically during the HKG connection.' },
                    { label: 'Baggage Tags', detail: 'Snap photos of all physical baggage claim stickers immediately; keep them in a shared phone note.' },
                    { label: 'Security & Airside', detail: 'Clear TSA security line. Refill empty water bottles immediately at hydration stations past checkpoint.' },
                    { label: 'Power & Maps', detail: 'Charge battery banks to 100% at the gate. Download offline Google Maps for Taipei and Dadaocheng before boarding.' },
                    { label: 'Gate Timing', detail: 'Check boarding pass and gate monitors for actual boarding times; be at the gate area with a comfortable buffer.' }
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
                notes: 'Nonstop flight (~16h05). Use the long flight to shift toward Taipei time: stay awake initially, then aim for a substantial sleep block aligned with East Asia night. Scheduled HKG arrival is approximately 2:05 PM Nov 29.',
                noMap: true,
                guide: {
                  intro: 'Transpacific flight routine to help adjust to East Asia time before landing.',
                  steps: [
                    { label: 'Timezone Shift', detail: 'Set watch and phone clock to Taipei time (UTC+8, +13h ahead of NYC EST) once cruising altitude is reached.' },
                    { label: 'Initial Awake Block', detail: 'Stay awake through departure and the first full meal service. Hydrate regularly with water; avoid excessive alcohol.' },
                    { label: 'Sleep Block', detail: 'Use an eye mask and earplugs; aim for an extended rest/sleep block during the mid-flight dark hours aligned with destination night.' },
                    { label: 'Pre-Arrival Wake-Up', detail: 'Wake with ample time before 2:05 PM descent to eat breakfast, stretch legs in the aisle, wash up, and prepare carry-on items for transit.' },
                    { label: 'Hydration', detail: 'Drink water before descent to counter cabin dryness.' }
                  ]
                }
              }
            ],
            foodRecommendation: 'Cathay Pacific onboard meal service; no dedicated JFK restaurant stop.',
            proteinPlan: 'Travel-day target ~150 g if practical: choose the meat/egg-heavy option at JFK and on both Cathay meal services; use a yogurt, milk/soy milk, eggs, or a protein drink as the gap-filler rather than replacing meals. · 旅行日若方便仍以約150g為目標：JFK與國泰餐點優先選肉類／蛋類，差額再用優格、牛奶／豆漿、蛋或蛋白飲補足，不用為追數字犧牲正常用餐。',
            insiderTip: 'Download offline podcasts and entertainment before JFK gate boarding.'
          },
          {
            id: 'day-02',
            dayNum: '02',
            shortLabel: 'Arrival / 抵達',
            city: 'Taipei / 台北',
            dateString: 'Sun, Nov 29, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Touchdown → Airport MRT → Warm Dinner',
            titleTc: '抵達台北・機場捷運・暖胃晚餐',
            hotelRef: 'taipei',
            transitSummary: 'Express Airport MRT (~39m direct)',
            weatherExpected: '~20°C • Mild evening conditions',
            leaveByTime: '5:35 PM on landing',
            timeline: [
              {
                time: '2:05 PM – 3:45 PM',
                title: 'Hong Kong Connection: CX841 Arrival ➔ CX472 Boarding (~1h40 Transit)',
                titleTc: '香港國際機場轉機（CX472）',
                icon: 'plane',
                notes: 'CX841 lands ~2:05 PM. Connection CX472 departs 3:45 PM for 5:35 PM Taipei arrival. If bags were tagged through to TPE at JFK, do not collect them in HKG; follow Flight Connections. Do not enter Hong Kong immigration.',
                noMap: true,
                guide: {
                  intro: 'Transit at HKG Terminal 1 between incoming CX841 and connecting CX472 to Taipei.',
                  steps: [
                    { label: 'Transfer Signs', detail: 'Follow overhead purple "Transfer / Flight Connections" signs immediately upon stepping into terminal concourse.' },
                    { label: 'Security', detail: 'Clear transit security screening. Do NOT exit through HK immigration or baggage claim.' },
                    { label: 'Gate Check', detail: 'Check departure monitors immediately for CX472 gate; gates at HKG may require an automated people mover ride. Cathay boarding pass/gate remains final authority.' },
                    { label: 'Hydration', detail: 'Use restrooms and refill water bottles near gate area.' },
                    { label: 'Boarding Buffer', detail: 'Check boarding pass for actual boarding time and be at the gate with a comfortable buffer.' }
                  ]
                }
              },
              {
                time: '5:35 PM – ~6:50 PM',
                title: 'Touchdown TPE Airport Terminal 1',
                titleTc: '桃園國際機場 第一航廈',
                icon: 'plane-landing',
                notes: 'Immigration, bags, EasyCards, then activate the group-admin Taiwan number before leaving the airport if the carrier queue is reasonable.',
                noMap: true,
                guide: {
                  intro: 'Terminal 1 arrival, digital immigration, cash withdrawal, and EasyCard setup.',
                  steps: [
                    { label: 'Immigration', detail: 'Proceed to Foreign Passport lanes. Present passports. Your submitted TWAC is retrieved electronically; no paper arrival card is required.' },
                    { label: 'Baggage Claim', detail: 'Collect 3 checked bags from designated carousel. Verify baggage claim tag numbers.' },
                    { label: 'ATM Cash', detail: 'Withdraw NT$3,000–5,000 cash from Bank of Taiwan or Mega Bank ATMs in arrival lobby using a debit card with no foreign transaction fees.' },
                    { label: 'EasyCard (悠遊卡)', detail: 'Buy one adult EasyCard per traveler from an airport/Metro EasyCard sales point or convenience store. Standard adult card currently costs NT$100 before stored value. Top up approximately NT$500 per card for MRT, buses, and other small transit purchases.' },
                    { label: 'Taiwan Number', detail: 'Default: get one CHT 10-day 4G tourist SIM/eSIM on the group-admin phone (current NT$500, unlimited data + NT$100 voice). Bring passport + a qualifying U.S. government photo ID such as a driver’s license. Test DATA + an incoming SMS before leaving the counter. If the line is >20–25 min and everyone already has working data, skip the airport queue and use a convenient city CHT service point later rather than delaying dinner.' },
                    { label: 'App Setup Later', detail: 'Do not stand in the airport configuring loyalty apps. Once at the hotel, use the new +886 number to register OPENPOINT/uniopen and FamilyMart if useful.' }
                  ],
                  recheck: 'Have TWD cash available for EasyCard purchase/top-up. Recheck the chosen carrier’s airport counter hours shortly before departure; carrier documentation/plan terms can change.'
                }
              },
              {
                time: '~6:50 PM – 7:30 PM',
                title: 'Express Airport MRT to Taipei Main Station',
                titleTc: '桃園機場捷運：第一航廈 A12 → 台北車站 A1',
                icon: 'train',
                notes: 'Purple Line express train takes ~39 minutes. Tap EasyCard at turnstile.',
                navigateTo: 'Airport MRT Terminal 1 Station A12, Dayuan District',
                guide: {
                  intro: 'Taoyuan Airport MRT (A12 Terminal 1) directly into Taipei Main Station (A1).',
                  steps: [
                    { label: 'Follow Signs', detail: 'Follow overhead purple "Taoyuan Airport MRT" signs down to B2 station concourse.' },
                    { label: 'Train Selection', detail: 'Board the PURPLE Express Train (直達車). Do NOT board the Blue Commuter Train (普通車), which stops at every local station and takes 52 minutes.' },
                    { label: 'Tap In', detail: 'Tap EasyCard at the gate; current A12 → A1 single fare is NT$160. Recheck fare/timetable shortly before travel.' },
                    { label: 'Luggage Storage', detail: 'Stow large suitcases in luggage racks near train doors; daypacks fit at your seat.' },
                    { label: 'Arrival at A1', detail: 'Ride ~39 minutes to Taipei Main Station (Station A1). Alight at final terminus.' }
                  ]
                }
              },
              {
                time: '~7:45 PM',
                title: 'Check In: Via Hotel Taipei Station',
                titleTc: '豐居旅店 站前館',
                icon: 'building-2',
                notes: 'Use Station Exit Z10 (elevator available) or NTU Hospital Exit 4. Check into 3 private solo rooms.',
                navigateTo: '台北市中正區重慶南路一段60號',
                addressTc: '台北市中正區重慶南路一段60號',
                guide: {
                  intro: 'Navigating from Airport MRT underground concourse to Via Hotel.',
                  steps: [
                    { label: 'Underground vs Street', detail: 'From Airport MRT A1, follow underground signs toward Taipei Station Underground Mall (Z Zone). If dragging heavy luggage, take Exit Z10 elevator to street level.' },
                    { label: 'Street-Level Fallback', detail: 'If underground navigation feels confusing, surface to Zhongxiao West Road street level immediately and walk south on Chongqing South Road Sec. 1.' },
                    { label: 'Hotel Entrance', detail: 'Enter Via Hotel Taipei Station at No. 60 Chongqing South Rd Sec. 1 and follow lobby/reception signage.' },
                    { label: 'Check-In', detail: 'Check in for 3 private solo rooms. Collect keycards, test Wi-Fi, drop suitcases, wash hands, and head out for dinner.' }
                  ]
                }
              },
                            {
                time: '8:15 PM – 9:30 PM',
                title: 'Fuhong Beef Noodles (backup: Xiao Wu) — Arrival Dinner',
                titleTc: '富宏牛肉麵（備案：小吳牛肉麵）',
                icon: 'utensils',
                notes: 'Two independently well-reviewed 24-hour beef-noodle shops on the same Luoyang Street block. Fuhong is the default; switch to Xiao Wu immediately if Fuhong is crowded. No post-flight restaurant detour.',
                navigateTo: '台北市萬華區洛陽街67號',
                addressTc: '台北市萬華區洛陽街67號',
                guide: {
                  intro: 'Arrival-night meal designed around reliability, review depth and zero backtracking.',
                  steps: [
                    { label: 'Primary', detail: 'Walk/taxi directly to Fuhong Beef Noodles 富宏牛肉麵, 洛陽街67號. It is currently listed 24 hours and has very high independent review volume.' },
                    { label: 'Backup', detail: 'If the seated wait looks longer than ~10–15 minutes, walk to Xiao Wu Beef Noodles 小吳牛肉麵, 洛陽街45-11號 on the same block. It is also currently listed 24 hours.' },
                    { label: 'Order', detail: 'Use beef noodles as the real dinner. Order 3 bowls or 2 bowls plus extra beef / braised sides to share; add vegetables if wanted.' },
                    { label: 'Exit', detail: 'Go straight back to Via Hotel after dinner. Arrival night is for eating and sleeping, not squeezing in Ximending.' }
                  ],
                  recheck: '48–72h before arrival: recheck 24-hour status for Fuhong and Xiao Wu.'
                }
              }
            ],
            backups: {
              foods: [
                {
                  title: 'Xiao Wu Beef Noodles',
                  titleTc: '小吳牛肉麵',
                  note: 'Same-block 24-hour backup explicitly named in the arrival-dinner timeline. Use when Fuhong wait exceeds ~10–15 min.',
                  navigateTo: '台北市萬華區洛陽街45-11號',
                  addressTc: '台北市萬華區洛陽街45-11號'
                }
              ]
            },
            foodRecommendation: 'Fuhong Beef Noodles 富宏牛肉麵 → Xiao Wu Beef Noodles 小吳牛肉麵 only if needed',
            proteinPlan: 'Target ~150 g: make beef noodles the real dinner—order extra beef/side dishes if available—then use a nearby convenience store for 1–2 tea eggs + unsweetened soy milk + ready-to-eat chicken/other lean protein only if still short. · 目標約150g：牛肉麵當主餐，可加牛肉／小菜；不足再到便利商店補茶葉蛋、無糖豆漿與即食雞胸／其他瘦肉。',
            insiderTip: 'Skip Raohe tonight. After travel, eat nearby and sleep by 11:00 PM to reset your clock.'
          },

          {
            id: 'day-03',
            dayNum: '03',
            shortLabel: 'Dihua / 迪化',
            city: 'Taipei / 台北',
            dateString: 'Mon, Nov 30, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Dihua → Qingshan Festival → Nanjichang → Dadaocheng Riverside Night',
            titleTc: '迪化街・青山王祭・南機場・大稻埕河濱夜走',
            hotelRef: 'taipei',
            transitSummary: 'MRT Green Line (Beimen to Longshan)',
            weatherExpected: '~22°C • Typically mild/drier season',
            rainBackupAvailable: true,
            easyPlan: "If timing slips, shorten Dihua browsing. The festival is capped at about 90–120 minutes of actual viewing; do not stand around for hours waiting for the procession.",
            leaveByTime: '9:30 AM from hotel',
            timeline: [
                            {
                time: '9:30 AM – 10:00 AM',
                title: 'Sihai Soy Milk King — Taiwanese Breakfast',
                titleTc: '四海豆漿大王・台式早餐',
                icon: 'utensils',
                notes: 'Named, high-volume breakfast stop on Chang’an West Road. Keep breakfast to ~30 min so the 10:30 woodworking slot stays comfortable.',
                navigateTo: '台北市大同區長安西路29號',
                addressTc: '台北市大同區長安西路29號',
                guide: {
                  intro: 'Fast traditional breakfast before Dihua Street.',
                  steps: [
                    { label: 'Order', detail: 'At 四海豆漿大王 order savory soy milk (鹹豆漿), egg crepes (蛋餅), eggs and one youtiao to share. Add xiaolongbao only if everyone is hungry.' },
                    { label: 'Queue Rule', detail: 'If the line will cost >10–15 minutes, simplify the order for takeaway rather than risking the workshop.' },
                    { label: 'Leave', detail: 'Finish by ~10:00 AM and continue directly to Minyicheng / Dihua Street.' }
                  ],
                  recheck: 'Current Monday hours cover breakfast; recheck shortly before travel.'
                }
              },
              {
                time: '10:20 AM – 1:00 PM',
                title: 'Dihua Street & Chopstick Woodworking (桔物手作)',
                titleTc: '迪化街老街 & 桔物手作 (民藝埕)',
                icon: 'hammer',
                notes: 'Arrive ~10:20 AM for 10:30 AM workshop. Plan, sand, and brand custom chopsticks at Minyicheng 3F.',
                navigateTo: '台北市大同區民生西路362巷34號3樓',
                addressTc: '台北市大同區民生西路362巷34號3樓',
                guide: {
                  intro: 'Hands-on woodworking craft followed by working heritage commerce in Dadaocheng.',
                  steps: [
                    { label: 'Studio Check-In', detail: 'Arrive at Minyicheng 3F (民生西路362巷34號3樓) by 10:20 AM (~10 min before 10:30 AM start). Long hair should be tied; wear comfortable clothing (mask suggested for wood dust).' },
                    { label: 'Craft Sequence', detail: 'Instructor introduces woodworking tools and wood properties. Mount blank in jig, use traditional woodworking hand plane to taper facets, and hand-sand until smooth.' },
                    { label: 'Personalization', detail: 'Brand custom name, sentence, initials, or symbols using branding iron under instructor guidance. Finish chopsticks and chopstick rest.' },
                    { label: 'Care Instructions', detail: 'Ask instructor for actual wood care instructions (hand-wash only, dry thoroughly) before packing.' },
                    { label: 'Dihua Exploration (12:00–1:00)', detail: 'Walk down Dihua Street. Notice working medicinal and dry goods merchants with open burlap sacks of dried scallops, wolfberries, and red dates. Peek into Yongle Market 2F textile halls.' },
                    { label: 'Purchases', detail: 'Limit purchases to 1 portable culinary item (e.g. sealed high-mountain oolong tea or candied dried guava).' }
                  ]
                }
              },
                            {
                time: '1:15 PM – 2:45 PM',
                title: 'Mai Mien Yen Tsai + South Street Delight — Dadaocheng Lunch & Tea',
                titleTc: '賣麵炎仔＋南街得意・大稻埕午餐與茶',
                icon: 'utensils',
                notes: 'Two named, independently reviewed Dadaocheng stops instead of “find something nearby.” Lunch first at Mai Mien Yen Tsai, then tea at South Street Delight; both sit naturally around the Dihua cluster.',
                navigateTo: '台北市大同區安西街106號',
                addressTc: '台北市大同區安西街106號',
                guide: {
                  intro: 'A specific, route-efficient lunch + Taiwanese-tea block with no influencer-line chasing.',
                  steps: [
                    { label: 'Lunch 1:15–2:00', detail: 'Eat at Mai Mien Yen Tsai 賣麵炎仔, 安西街106號. Choose its pork/noodle/soup specialties and build a real protein-forward lunch.' },
                    { label: 'Tea 2:05–2:45', detail: 'Walk back toward Dihua Street to South Street Delight 南街得意, 迪化街一段67號2樓. Choose a Taiwanese oolong or Oriental Beauty and treat this as the planned sit-down reset.' },
                    { label: 'Queue Rule', detail: 'Do not wait >10–15 min at either stop. If lunch is unexpectedly slammed, skip the sit-down tea before sacrificing the Qingshan timing buffer.' },
                    { label: 'No Extra Food Crawl', detail: 'Dihua browsing is already complete. Leave the area after tea rather than stacking additional viral snack shops.' }
                  ]
                }
              },
              {
                time: '~4:30 PM – 6:30 PM target',
                title: 'Monga Qingshan King Festival — Highlight Window',
                titleTc: '艋舺青山王祭・精華時段',
                icon: 'sparkles',
                notes: 'Do NOT devote the entire afternoon/evening to this. Target ~90–120 min of real procession action: 八家將, 神將, palanquins, drums/gongs, firecrackers and street atmosphere. Exact Nov 30 route/timing is not final yet, so intercept the procession where the live route is active rather than waiting at one fixed point. / 不需要待四、五小時；看到約 90–120 分鐘精華就走。',
                navigateTo: '台北市萬華區貴陽街二段218號',
                addressTc: '台北市萬華區貴陽街二段218號',
                guide: {
                  intro: 'Treat this as a high-energy street spectacle, not a temple visit; one strong procession cycle is enough.',
                  steps: [
                    { label: 'Live Route First', detail: '48–72h before Nov 30, check the official Qingshan Temple route/posting and identify where the main procession will be around late afternoon. Go to the action; do not camp at the temple for hours.' },
                    { label: 'Target Window', detail: 'Aim for about 90–120 minutes of actual viewing. If the first 60–90 minutes already includes 八家將, deity figures, palanquins, pyrotechnics and several troupe types, you have seen the high-value part.' },
                    { label: 'Positioning', detail: 'Use MRT/walking into Wanhua and position on a broad sidewalk or verified route segment. Avoid taxis inside active road closures.' },
                    { label: 'Safety', detail: 'Earplugs are smart. Stand well back from firecrackers and follow police/temple staff. Do not cross between ritual formations or in front of palanquins.' },
                    { label: 'Boredom Rule', detail: 'Once formations begin repeating and there is no clearly announced major sequence worth waiting for, leave immediately for dinner. No sunk-cost festival watching.' },
                    { label: 'Delay Fallback', detail: 'If the main procession is delayed, eat first or explore nearby Wanhua streets and re-intercept later. Cap total dead waiting time at ~20–30 minutes.' }
                  ],
                  exit: 'Leave after ~90–120 min of actual action, usually around 6:15–6:30 PM if the target window works.',
                  recheck: 'Official 2026 dates are Nov 28–30; exact Nov 30 route/timing still needs a 48–72h live check.'
                }
              },
                            {
                time: '~7:00 PM – 8:30 PM',
                title: 'Xiaodi Rice Cake + Ho Jia Steamed Stinky Tofu — Nanjichang Dinner',
                titleTc: '曉迪筒仔米糕＋禾甲現蒸臭豆腐・南機場晚餐',
                icon: 'utensils',
                notes: 'Named Nanjichang anchors with strong independent review signals. Browse the market, but only queue for a specific stall when the wait is sensible.',
                navigateTo: '台北市中正區中華路二段307巷',
                addressTc: '台北市中正區中華路二段307巷',
                guide: {
                  intro: 'A two-anchor dinner instead of an open-ended viral-stall hunt.',
                  steps: [
                    { label: 'Anchor 1', detail: 'Start at Xiaodi Tube Rice Cake 曉迪筒仔米糕 in Lane 307 for rice cake / braised pork / soup. Share portions so this is not the whole meal.' },
                    { label: 'Anchor 2', detail: 'If its line is <=10–15 min, try Ho Jia Steamed Stinky Tofu 禾甲現蒸臭豆腐, Lane 313 No.18. It is vegetarian and better as a shared contrast than a protein anchor.' },
                    { label: 'Queue Rule', detail: 'Ho Jia can develop long evening waits. If the line is >10–15 min, skip it with zero regret; Xiaodi plus another clearly busy cooked-food stall is enough.' },
                    { label: 'Exit', detail: 'Finish around 8:20 PM. Use a short taxi/ride north to Dadaocheng Wharf for the river-night finish; no second night market.' }
                  ]
                }
              },
              {
                time: '~8:45 PM – 10:05 PM',
                title: 'Dadaocheng Wharf + Yanping Riverside Night Walk',
                titleTc: '大稻埕碼頭＋延平河濱夜走',
                icon: 'footprints',
                notes: 'The day already visits Dadaocheng in daylight; returning briefly at night is intentionally a different riverfront experience, and it is still on the west side of Taipei. Current city listing keeps the wharf open to 10 PM and Yanping Riverside Park is 24 hours.',
                navigateTo: 'Dadaocheng Wharf, Datong District, Taipei',
                addressTc: '台北市大同區大稻埕碼頭',
                guide: {
                  steps: [
                    { label: 'Transfer', detail: 'After Nanjichang dinner, split a short taxi/app ride to Dadaocheng Wharf rather than adding a slow multi-transfer transit leg.' },
                    { label: 'Wharf', detail: 'Walk the lit pier/river edge and the container-market frontage without turning it into another food stop.' },
                    { label: 'Riverside', detail: 'Continue onto the Yanping Riverside path for open space and night views along the Tamsui River.' },
                    { label: 'Exit', detail: 'Start back around 9:50–10:05 PM and reach Via Hotel around 10:20–10:30 PM.' }
                  ]
                }
              }
            ],
            rainPlan: 'Light / moderate rain: Use umbrellas or ponchos and keep Qingshan procession. Severe weather: Spend more time in Dihua indoor shops, cafés, covered arcades, Huashan / Syntrend / Taipei Main underground mall, and skip outdoor procession only if severe conditions warrant.',
            backups: {},
            foodRecommendation: '四海豆漿大王 → 賣麵炎仔 → 南街得意 → 曉迪筒仔米糕 / 禾甲現蒸臭豆腐',
            proteinPlan: 'Target ~150 g: breakfast = savory soy milk + egg crepe + extra egg; at Dadaocheng/Nanjichang prioritize chicken, pork, beef, dumplings, tofu, eggs and skewers before carb-heavy snacks. Convenience-store chicken + soy milk is the late top-up if needed. · 目標約150g：早餐鹹豆漿＋蛋餅＋加蛋；大稻埕／南機場先吃雞、豬、牛、餃類、豆腐、蛋與肉串，再分食澱粉型小吃。不足時晚上用便利商店雞胸＋無糖豆漿補。',
            insiderTip: 'Do not take taxis into the active Wanhua procession zone. After dinner, however, a short taxi north to Dadaocheng is the efficient move; the river walk now gives the day a proper ~10 PM finish.'
          },

          {
            id: 'day-04',
            dayNum: '04',
            shortLabel: 'Beitou / 北投',
            city: 'Taipei / 台北',
            dateString: 'Tue, Dec 01, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Chrysanthemum Show → Beitou Hot Spring → Tamsui Active Sunset',
            titleTc: '士林菊展・北投溫泉・淡水八里渡船夕陽',
            hotelRef: 'taipei',
            transitSummary: 'MRT Red Line Corridor',
            weatherExpected: '~19°C • Cool mountain air; layer up',
            rainBackupAvailable: true,
            easyPlan: "If Beitou runs late or weather is poor, skip the Bali ferry/Left Bank walk and go straight to Tamsui waterfront. Preserve the private hot spring and sunset.",
            leaveByTime: '9:30 AM from hotel',
            timeline: [
              {
                time: '10:00 AM – 11:10 AM',
                title: 'Shilin Residence Chrysanthemum Exhibition',
                titleTc: '士林官邸',
                icon: 'flower',
                notes: 'Annual floral festival in Chiang Kai-shek’s gardens (runs Nov 27–Dec 13). Free admission.',
                navigateTo: '台北市士林區福林路60號',
                addressTc: '台北市士林區福林路60號',
                guide: {
                  intro: 'Walk through annual Chrysanthemum floral exhibition in Shilin formal gardens.',
                  steps: [
                    { label: 'Transit', detail: 'Take MRT Red Line from Taipei Main to Shilin Station Exit 2. Walk 8 minutes east along Zhongshan N. Rd to main garden gate.' },
                    { label: 'Route', detail: 'Enter outdoor formal garden zone. The theme highlights dramatic sculpted cascade chrysanthemums (懸崖菊) and specimen blooms.' },
                    { label: 'Photography', detail: 'Capture wide landscape views of European-style garden beds and macro close-ups of rare single-stem blooms.' },
                    { label: 'Skip', detail: 'Do NOT wait in line for interior historical residence house unless zero wait; focus 70 minutes on outdoor floral displays.' }
                  ]
                }
              },
              {
                time: '11:40 AM – 11:50 AM',
                title: 'Beitou Thermal Valley Walk',
                titleTc: '地熱谷',
                icon: 'eye',
                notes: 'Walk boardwalk around steaming emerald sulfuric thermal spring pool. Transfer ~11:50 AM toward Grand View.',
                navigateTo: '台北市北投區中山路30-10號',
                addressTc: '台北市北投區中山路30-10號',
                guide: {
                  intro: '10–15 minute natural volcanic spring boardwalk walk.',
                  steps: [
                    { label: 'Transit', detail: 'Take MRT Red Line from Shilin to Beitou, transfer to 1-station Xinbeitou pink branch line. Walk up Zhongshan Road through Beitou Park.' },
                    { label: 'Boardwalk', detail: 'Follow wooden boardwalk circling geothermal spring pool (temperatures reach 90°C). Smell mineral sulfur steam and view bubbling jade-green waters.' },
                    { label: 'Exit', detail: 'Be on the road by 11:50 AM. Use the Grand View hotel shuttle first if its timing lines up; otherwise take a short metered taxi. Target arrival around ~12:00 PM for the ~12:15 PM soak.' }
                  ]
                }
              },
              {
                time: '~12:15 PM – 1:45 PM',
                title: 'Grand View Beitou Private Hot Spring Soak',
                titleTc: '北投麗禧溫泉酒店',
                icon: 'bath',
                notes: '90-min private hot spring room in natural sulfur bathhouse. Arrive early. Confirmed reservation time overrides planning schedule.',
                navigateTo: '台北市北投區幽雅路30號',
                addressTc: '台北市北投區幽雅路30號',
                guide: {
                  intro: '90-minute private white sulfur mineral soak protocol at Grand View Resort Beitou.',
                  steps: [
                    { label: 'Arrival', detail: 'Arrive at B2 Private Hot Spring Reception Counter by 12:05 PM (~10 min before reservation). Present booking name.' },
                    { label: 'Room Features', detail: 'Private room features a granite white sulfur bath, shower area, and towels. Specific amenities depend on the selected room category.' },
                    { label: 'Soak Comfort', detail: 'Shower thoroughly before entering hot pool. Start with 10–12 minute soaks, step out onto wooden deck to cool down, hydrate, and repeat. Do not submerge head in sulfur water.' },
                    { label: 'Rules', detail: 'Outside food is strictly prohibited. Current official rule: room is held for only 5 minutes after the reservation time.' },
                    { label: 'Departure', detail: 'Begin rinsing and dressing 15 minutes before 90-minute cutoff. Meet in lobby by 1:45 PM for transfer downhill.' }
                  ],
                  recheck: 'Confirmed reservation time overrides planning schedule. Arrive 10 min early.'
                }
              },
              {
                time: '1:45 PM – 2:05 PM',
                title: 'Grand View → Beitou Lunch Transfer',
                titleTc: '北投麗禧 → 北投午餐・下山移動',
                icon: 'car',
                notes: 'A real downhill transfer block now separates the 90-minute soak from lunch. Use the hotel shuttle only if it is immediate; otherwise split a short metered/app-dispatched taxi so the afternoon does not begin with a hidden 20-minute delay.',
                navigateTo: '台北市北投區中央北路一段224號',
                addressTc: '台北市北投區中央北路一段224號',
                guide: {
                  intro: 'Protect the hot-spring finish and make the downhill move explicit rather than pretending lunch begins at the same minute the room ends.',
                  steps: [
                    { label: 'Exit Cleanly', detail: 'Be dressed and in the Grand View lobby by 1:45 PM; do not use the final minutes of the room for a rushed shower or repacking.' },
                    { label: 'Choose the Faster Move', detail: 'Take the hotel shuttle only if it is ready to depart. Otherwise compare Uber / 55688 / LINE GO or use a metered taxi downhill.' },
                    { label: 'Lunch Arrival', detail: 'Target Wu Beef Noodles around 2:05 PM. If the transfer runs late, use the Ootoya fallback rather than compressing the sunset block.' }
                  ]
                }
              },
              {
                time: '2:05 PM – 2:50 PM',
                title: 'Wu Beef Noodles (backup: Ootoya Xinbeitou) — Beitou Lunch',
                titleTc: '吳家牛肉麵（備案：大戶屋新北投）・北投午餐',
                icon: 'utensils',
                notes: 'Higher-volume local beef-noodle anchor with a predictable no-drama Ootoya Xinbeitou backup if timing or queue is poor.',
                navigateTo: '台北市北投區中央北路一段224號',
                addressTc: '台北市北投區中央北路一段224號',
                guide: {
                  intro: 'Fast downhill lunch before the Red Line continues north to Tamsui.',
                  steps: [
                                        { label: 'Primary', detail: 'Eat at Wu Beef Noodles 吳家牛肉麵, 中央北路一段224號. Current Tuesday hours cover this lunch window and the review base is deep.' },
                    { label: 'Backup', detail: 'If Wu is closed or the wait is >10–15 min, use Ootoya Xinbeitou 大戶屋新北投店 rather than hunting for another internet-famous shop.' },
                    { label: 'Hard Exit', detail: 'Finish by ~2:50 PM and take the Red Line north. Tamsui sunset timing matters more than marginal lunch upside.' }
                  ]
                }
              },
              {
                time: '2:50 PM – 4:25 PM',
                title: 'Red Line to Tamsui + Conditional Bali Ferry Micro-Loop',
                titleTc: '淡水 → 八里渡船・條件式左岸短走',
                icon: 'ship',
                notes: 'Bali is now a go/no-go micro-loop, not an anchor. New Taipei guidance allows materially longer waits/crossings depending on tide, so cross only if the next boat is visibly imminent. Otherwise stay in Tamsui and protect the 5:03 PM sunset. / 八里只在船班順時加，不為了過河犧牲淡水夕陽。',
                navigateTo: '新北市淡水區渡船頭',
                addressTc: '新北市淡水區渡船頭',
                guide: {
                  intro: 'A compact ferry bonus that is attempted only when live operations make the timing obviously safe.',
                  steps: [
                    { label: 'Direct to Tamsui', detail: 'Finish lunch around 2:50 PM and take the Red Line north to Tamsui. Target the waterfront around 3:25–3:35 PM; do not add an intermediate attraction.' },
                    { label: 'Go / No-Go at the Pier', detail: 'Check the actual queue and next departure. Cross only if the next Bali boat is about to leave / clearly within roughly 10 minutes and service is moving normally. Current city guidance allows substantially longer waits/crossings depending on tide, so do not assume a best-case headway.' },
                    { label: 'Bali Micro-Loop', detail: 'If you cross, keep the Left Bank to roughly 20–25 minutes: fast waterfront walk, photos, then turn back. This is not a 40-minute outbound stroll.' },
                    { label: 'Hard Turnaround', detail: 'Only cross when the next boat is visibly imminent. Be back at Bali Ferry Pier by about 4:00 PM; if that is not obviously achievable, do not cross.' },
                    { label: 'Skip Rule', detail: 'If service is disrupted, the queue is unclear, or the next sailing is not imminent, stay on the Tamsui side. You lose almost nothing and gain a much safer sunset buffer.' }
                  ],
                  exit: 'Be on the Tamsui side by ~4:20–4:25 PM; walk directly to the open waterfront for golden hour.',
                  recheck: 'Same day: verify ferry operations/weather and make the decision from the live queue, not an assumed timetable.'
                }
              },
              {
                time: '~4:25 PM – 5:15 PM',
                title: 'Tamsui Waterfront Sunset',
                titleTc: '淡水老街',
                icon: 'eye',
                notes: 'Watch the 5:03 PM winter sunset over Taiwan Strait from open waterfront promenade.',
                navigateTo: '新北市淡水區中正路',
                addressTc: '新北市淡水區中正路',
                guide: {
                  intro: 'Golden hour viewing over Taiwan Strait estuary and Bali mountain coastline. Prioritize the open river promenade before exploring Old Street shops.',
                  steps: [
                    { label: 'Exit & Waterfront', detail: 'Exit Tamsui MRT. Walk directly west toward the open waterfront promenade along Zhongzheng Road. Do NOT begin food shopping or browsing alleys yet.' },
                    { label: 'Sunset Window', detail: 'Sunset on Dec 1 is at 5:03 PM. Position along the open river wharf by 4:40–4:45 PM to watch the glowing red sun sink behind the Bali mountain ridge.' },
                    { label: 'Photography', detail: 'Shoot wide-angle photos of fishing boats moored along stone quays bathed in amber twilight.' },
                    { label: 'Return Buffer', detail: 'Bali is optional. Be on the Tamsui side by ~4:25 PM and walk straight to the waterfront so the 5:03 PM sunset cannot be compromised.' },
                    { label: 'Transition to Dinner', detail: 'After the sun dips below the horizon (~5:15 PM), head inland toward Zhongzheng Road Old Street for dinner.' }
                  ]
                }
              },
                            {
                time: '5:15 PM – 6:30 PM',
                title: 'Old Tamsui Fish Ball & A-Gei — Early Dinner',
                titleTc: '老店淡水魚丸阿給・夕陽後早晚餐',
                icon: 'utensils',
                notes: 'One named Old Street shop with a large review base and hours that comfortably survive the 5:03 PM sunset. This is cleaner than racing between several closing snack shops.',
                navigateTo: '新北市淡水區中正路135之2號',
                addressTc: '新北市淡水區中正路135之2號',
                guide: {
                  intro: 'Compact post-sunset Tamsui meal before the Red Line ride back and evening gym.',
                  steps: [
                    { label: 'Walk In', detail: 'After sunset, walk directly to 老店淡水魚丸阿給 at 中正路135之2號.' },
                    { label: 'Order', detail: 'Share A-Gei, fish-ball soup and another savory/protein dish. Do not build dinner around sweets or souvenir snacks.' },
                    { label: 'Queue Rule', detail: 'If the seated wait exceeds ~10–15 min, skip it and use a nearby 7-ELEVEN / FamilyMart protein combination rather than delaying the gym.' },
                    { label: 'Exit', detail: 'Finish around 6:20–6:30 PM, stroll back toward Tamsui MRT, then take the Red Line south.' }
                  ],
                  recheck: 'Rain can cause earlier closing; recheck same day.'
                }
              },
              {
                time: '~8:30 PM – 9:30 PM',
                title: 'Routine Gym — 45–50 min Maintenance Lift',
                titleTc: '臺北市中正運動中心 2F 體適能中心',
                icon: 'dumbbell',
                notes: 'On-route Red Line workout after Tamsui. NT$50/hour. Keep 2–3 reps in reserve; no failure or high-volume legs. Fitness center closes at 10:00 PM.',
                navigateTo: '台北市中正區信義路一段1號',
                addressTc: '台北市中正區信義路一段1號',
                guide: {
                  steps: [
                    { label: 'Transit', detail: 'From Tamsui, take the MRT Red Line south and alight at NTU Hospital. Follow the practical walking route toward Zhongzheng Sports Center. This avoids returning to Via Hotel and then going back out.' },
                    { label: 'Entry', detail: 'Purchase the NT$50 one-hour fitness-center ticket. Use locker as needed. Official facility provides lockers and shower space.' },
                    { label: 'Training', detail: 'Target ~45–50 min of maintenance lifting. Keep 2–3 reps in reserve. No failure sets and no high-volume legs.' },
                    { label: 'Exit', detail: 'Finish lifting around ~9:15–9:20 PM. Quick shower/change if useful. Leave the center around ~9:30 PM; walk/transit if convenient, otherwise split a short metered taxi back to Via.' }
                  ]
                }
              }
            ],
            rainPlan: 'If rain is steady, keep the private Beitou soak, use Beitou Public Library / a covered café as a short shelter stop, skip the Bali walk, and ride directly to Tamsui only if waterfront conditions are still worthwhile. Do not add a museum detour just to fill time.',
            backups: {
              activity: {
                title: 'Beitou Public Library Indoor Reset',
                titleTc: '北投圖書館・室內休息',
                note: 'Rain shelter near the hot-spring area without adding another attraction.',
                navigateTo: '台北市北投區光明路251號',
                addressTc: '台北市北投區光明路251號'
              },
              foods: [
                {
                  title: 'Ootoya Xinbeitou',
                  titleTc: '大戶屋 新北投店',
                  note: 'Explicitly named lunch fallback in the Beitou timeline when Wu Beef Noodles is closed or >10–15 min.',
                  navigateTo: 'Ootoya Xinbeitou, Taipei',
                  addressTc: '台北市北投區'
                }
              ]
            },
            foodRecommendation: 'Wu Beef Noodles 吳家牛肉麵 → Old Tamsui Fish Ball & A-Gei 老店淡水魚丸阿給',
            proteinPlan: 'Target ~150 g: choose a meat/egg/tofu-forward Beitou lunch, then lean hard into Tamsui seafood, fish-ball soup, eggs/tofu and A-Gei at dinner. After the gym, add milk/soy milk or another lean-protein convenience-store item only if the day is still short. · 目標約150g：北投午餐優先肉、蛋、豆腐；淡水晚餐把海鮮、魚丸湯、蛋／豆腐與阿給當主體。健身後若仍不足，再用牛奶／豆漿或便利商店瘦肉補。',
            insiderTip: 'The Bali ferry is optional, not an anchor. Cross only when the next boat is visibly imminent and the 3:55 PM Bali-pier turnaround is easy; otherwise Tamsui sunset wins.'
          },

          {
            id: 'day-05',
            dayNum: '05',
            shortLabel: 'Jiufen / 九份',
            city: 'Taipei Day Trip / 台北近郊',
            dateString: 'Wed, Dec 02, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Shifen Waterfall → Jinguashi Trails → Jiufen Dusk',
            titleTc: '十分瀑布・金瓜石步道・九份黃昏',
            hotelRef: 'taipei',
            transitSummary: 'Private Van Exception — multi-stop mountain day (9:30 AM – 7:30 PM)',
            weatherExpected: '~18°C • Mountain mist; rain possible',
            rainBackupAvailable: true,
            easyPlan: null,
            leaveByTime: '9:30 AM hotel pickup',
            timeline: [
              {
                time: '9:30 AM – 10:45 AM',
                title: 'Private Van Pickup to Shifen Waterfall',
                titleTc: '飯店出發 → 十分瀑布',
                icon: 'car',
                notes: 'One of the rare private-car exceptions: split 3 ways (~$35/person) for a multi-stop mountain route, saving roughly 3 hours of local train/bus transfers and awkward connections.',
                navigateTo: '新北市平溪區乾坑10號',
                addressTc: '新北市平溪區乾坑10號',
                guide: {
                  intro: 'Driver pickup briefing and morning scenic mountain transit.',
                  steps: [
                    { label: 'Meet Driver', detail: 'Meet driver in Via Hotel lobby at 9:30 AM sharp. Confirm van license plate from booking voucher.' },
                    { label: 'Route Briefing', detail: 'Brief driver on stops: Shifen Waterfall → Shifen Old St (quick lunch) → Jinguashi → Jiufen (dusk tea) → Hotel return by 7:30 PM.' },
                    { label: 'In Transit', detail: 'Drive 55 minutes northeast along Freeway 1 and Route 106 into Pingxi mountain valley.' }
                  ]
                }
              },
              {
                time: '10:45 AM – 12:15 PM',
                title: 'Shifen Waterfall Walk',
                titleTc: '十分瀑布公園',
                icon: 'camera',
                notes: 'Walk suspension bridges and forested boardwalks to view Taiwan’s widest curtain waterfall.',
                navigateTo: '新北市平溪區乾坑10號',
                addressTc: '新北市平溪區乾坑10號',
                guide: {
                  intro: 'Forest boardwalk walk to the "Little Niagara of Taiwan".',
                  steps: [
                    { label: 'Entrance Path', detail: 'Driver drops near scenic park entrance on Route 106. Walk across Siguangtan Suspension Bridge over Keelung River.' },
                    { label: 'Observation Platforms', detail: 'Walk down to Platform 3 for eye-level view of 20-meter curtain falls roaring into emerald plunge pool.' },
                    { label: 'Platform 1', detail: 'Ascend to top covered viewing pavilion (Platform 1). If sun breaks through mist, look for signature rainbow arching over spray.' },
                    { label: 'Walk Back', detail: 'Walk back out along paved pedestrian route past visitor center. Do not linger more than 75 minutes.' }
                  ]
                }
              },
                            {
                time: '12:15 PM – 1:00 PM',
                title: 'LiouGe Chicken-Wing Rice — Shifen Quick Lunch & Rail Walk',
                titleTc: '十分溜哥雞翅包飯・快速午餐與鐵道散步',
                icon: 'utensils',
                notes: 'Specific Shifen food stop rather than an undefined snack hunt. It is reviewed well enough for a quick taste, but not worth a long viral queue.',
                navigateTo: '新北市平溪區十分街52號',
                addressTc: '新北市平溪區十分街52號',
                guide: {
                  intro: 'Time-boxed Shifen lunch while preserving the mountain afternoon.',
                  steps: [
                    { label: 'Rail Walk', detail: 'Stroll the active railway street and fully clear the tracks whenever a train approaches.' },
                    { label: 'Lunch', detail: 'At 十分溜哥燒烤雞翅包飯, 十分街52號, share chicken-wing rice rolls and add another savory item only if immediately available.' },
                    { label: 'Strict Queue Rule', detail: 'If LiouGe is >10 minutes, skip it. Independent traveler discussion is mixed on whether it is worth a long line; buy a simple 7-ELEVEN / FamilyMart protein snack instead.' },
                    { label: 'Skip Lanterns', detail: 'Do not purchase/release sky lanterns. Be back with the driver by ~1:00 PM.' }
                  ]
                }
              },
              {
                time: '~1:40 PM – 3:45 PM',
                title: 'Jinguashi: Teapot Mountain or Gold Museum Campus',
                titleTc: '金瓜石 (無耳茶壺山 / 黃金博物館)',
                icon: 'footprints',
                notes: '~35-minute charter transfer from Shifen. This is the same all-day van—not a separate car charge. If dry: scenic out-and-back trail. If wet/foggy: Gold Museum campus (general admission NT$80).',
                navigateTo: '新北市瑞芳區金光路8號',
                addressTc: '新北市瑞芳區金光路8號',
                guide: {
                  intro: 'Historic mining village with weather-dependent outdoor trail and sheltered heritage options.',
                  steps: [
                    { label: 'Arrive & Check', detail: 'Arrive in Jinguashi around 1:40 PM. Check current weather, cloud base, and trail surface condition immediately.' },
                    { label: 'Dry Weather Trail', detail: 'If weather is clear and dry, have driver drop at the practical trailhead near Quanji Hall for a time-boxed Teapot Mountain out-and-back trail with sea views. Turn around by 3:05–3:10 PM regardless of progress to protect the Jiufen schedule.' },
                    { label: 'Wet / Foggy Path', detail: 'If wet or visibility is poor, driver drops at Gold Museum entrance (general admission NT$80). Walk through Japanese-style Four Joined Cottages, explore Gold Building mining exhibits, and touch the 220kg pure gold brick if accessible.' },
                    { label: 'Benshan No. 5 Tunnel', detail: 'If operating and timing fits, the tunnel experience is currently NT$50. Safety maintenance presently limits access to the first ~70 meters rather than the full tunnel. Treat this as optional and follow the museum’s on-site/current operating notice.' },
                    { label: 'Gold Panning', detail: 'Only join a gold-panning session if a current scheduled session aligns cleanly without delaying departure.' },
                    { label: 'Transit to Jiufen', detail: 'Re-board van by 3:55 PM for short 15-minute winding mountain drive over to Jiufen.' }
                  ],
                  recheck: '48–72h before: verify Benshan No. 5 access status, Gold Museum operating hours, and current experience-session times.'
                }
              },
                            {
                time: '4:15 PM – 6:30 PM',
                title: 'Jiufen Old Noodle Shop + Jiufen Teahouse — Early Dinner & Dusk',
                titleTc: '九份老麵店＋九份茶坊・早晚餐與黃昏',
                icon: 'utensils',
                notes: 'Two named, well-reviewed Jiufen anchors. Eat first because the noodle shop closes earlier; then use Jiufen Teahouse for the dusk atmosphere rather than queueing at A-Mei.',
                navigateTo: '新北市瑞芳區基山街45號',
                addressTc: '新北市瑞芳區基山街45號',
                guide: {
                  intro: 'Specific food + tea sequence timed around Jiufen closing hours and twilight.',
                  steps: [
                    { label: 'Early Dinner 4:15–4:50', detail: 'Go first to Jiufen Old Noodle Shop 九份老麵店, 基山街45號. Eat noodles / braised sides while it is comfortably before the current 6:00 PM close.' },
                    { label: 'Lane Walk', detail: 'Walk Jishan/Shuqi lanes after dinner. Take photos from public viewpoints; do not queue for one exact Instagram angle.' },
                    { label: 'Tea 5:10–6:10', detail: 'Settle at Jiufen Teahouse 九份茶坊, 基山街142號, for Taiwanese high-mountain oolong / Oriental Beauty. Its strong review base makes it the planned tea stop.' },
                    { label: 'A-Mei Rule', detail: 'A-Mei is a photo landmark, not the meal plan. Do not burn an hour waiting there.' },
                    { label: 'Exit', detail: 'Meet the van around 6:30 PM and return to Taipei.' }
                  ]
                }
              },
              {
                time: '6:30 PM – 7:30 PM',
                title: 'Private Van Return to Hotel',
                titleTc: '九份 → 台北飯店',
                icon: 'car',
                notes: 'Avoid crowded bus lines in dark. Driver drops your group off directly at hotel lobby.',
                navigateTo: '台北市中正區重慶南路一段60號',
                addressTc: '台北市中正區重慶南路一段60號',
                guide: {
                  intro: 'Relaxing direct transfer avoiding winding public bus lines down Keelung mountain.',
                  steps: [
                    { label: 'Board Van', detail: 'Settle into van with daypacks and snacks. Rest feet during 50-minute highway drive.' },
                    { label: 'Arrival', detail: 'Driver drops group directly at Via Hotel entrance around 7:30 PM.' },
                    { label: 'Quick Reset', detail: 'Drop daypacks in rooms, wash hands, and change into loose comfortable clothing for massage tonight.' }
                  ]
                }
              },
                            {
                time: '7:30 PM – 8:25 PM',
                title: 'Hotel Reset + Direct Transfer to NARA',
                titleTc: '飯店快速整理・直達 NARA 泰式按摩',
                icon: 'navigation',
                notes: 'Dinner is already handled in Jiufen. Use this reclaimed block for bathroom/water/change and a calm direct ride to NARA instead of forcing a second meal before 120 minutes of bodywork.',
                noMap: true,
                guide: {
                  intro: 'Deliberate decompression buffer after the mountain day.',
                  steps: [
                    { label: 'Reset', detail: 'Arrive back around 7:30 PM, drop daypacks, use restroom and change into comfortable clothes.' },
                    { label: 'Small Top-Up Only', detail: 'If genuinely hungry, use the Via-area 7-ELEVEN / FamilyMart for soy milk, eggs or ready protein. This is a top-up, not another restaurant stop.' },
                    { label: 'Direct Ride', detail: 'Around 8:15–8:20 PM compare Uber / 55688 / LINE GO and take the best direct app-dispatched ride to NARA, 仁愛路四段345巷4弄19號.' },
                    { label: 'Arrival', detail: 'Target NARA by ~8:35 PM, at least 10 minutes before the 8:45 PM appointment.' }
                  ]
                }
              },
              {
                time: '8:45 PM – 10:45 PM',
                title: 'NARA Thai Massage: 120-min Traditional Bodywork',
                titleTc: 'NARA 泰式養生館',
                icon: 'sparkles',
                notes: '120-min authentic Thai acupressure & passive stretching (NT$1,299/person). Fixed advance booking.',
                navigateTo: '台北市大安區仁愛路四段345巷4弄19號',
                addressTc: '台北市大安區仁愛路四段345巷4弄19號',
                guide: {
                  intro: 'Traditional Thai bodywork session — passive stretching, rhythmic compression, and assisted joint release.',
                  steps: [
                    { label: 'Arrival & Check-In', detail: 'Arrive at NARA by 8:35 PM (~10 min early). Confirm 3-person appointment for 120-minute Traditional Thai Massage (泰式古法舒壓按摩, NT$1,299/person). Confirm traditional dry massage, not oil.' },
                    { label: 'Foot Soak', detail: 'Begin with a warm botanical foot soak and gentle scrub before moving to the massage area.' },
                    { label: 'Apparel', detail: 'Change into the provided loose cotton Thai massage garments.' },
                    { label: 'Technique', detail: 'Native Thai therapists apply rhythmic palm and thumb compression along sen lines, followed by assisted yoga-style back and hip stretches.' },
                    { label: 'Communicate Pressure', detail: 'Calibrate pressure naturally: 「力道剛好」 (just right), 「輕一點」 (lighter), or 「重一點」 (stronger).' },
                    { label: 'Herbal Tea & Return', detail: 'Sip warm lemongrass tea after completion. Use the Blue Line if it is still convenient; otherwise split a short metered taxi 3 ways. In bed by 11:15 PM rested and ready for tomorrow.' }
                  ],
                  exit: 'Finish treatment and tea by 10:55 PM. Easy direct return to Via Hotel.',
                  recheck: 'Fixed booking: Book appointment 2–3 weeks ahead to guarantee 3 simultaneous therapists.'
                }
              }
            ],
            rainPlan: 'In mountain rain, swap Teapot Mountain trail for sheltered Gold Museum exhibits, then spend extra time in Jiufen teahouses.',
            backups: {
              activity: {
                title: 'Golden Waterfall & Yin Yang Sea',
                titleTc: '黃金瀑布 & 陰陽海',
                note: 'Driver/time dependent scenic roadside backup around Jinguashi.',
                navigateTo: '新北市瑞芳區金光路8號',
                addressTc: '新北市瑞芳區金光路8號'
              }
            },
            foodRecommendation: '十分溜哥燒烤雞翅包飯 → 九份老麵店 → 九份茶坊',
            proteinPlan: 'Target ~150 g: Shifen/Jiufen snacks are for tasting, not the meal base. At lunch and the pre-NARA light dinner prioritize chicken, pork, beef, eggs or tofu; add a convenience-store chicken breast/soy milk combo before the massage if protein is lagging. · 目標約150g：十分／九份小吃以嚐鮮為主，不拿甜食與澱粉當正餐。午餐與NARA前的輕晚餐優先雞、豬、牛、蛋或豆腐；若蛋白不足，按摩前用便利商店雞胸＋豆漿補。',
            insiderTip: 'Skip releasing sky lanterns at Shifen—local forestry teams document severe environmental and wildfire risks.'
          },

          {
            id: 'day-06',
            dayNum: '06',
            shortLabel: '101 / 象山',
            city: 'Taipei / 台北',
            dateString: 'Thu, Dec 03, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Archery → Air Rifle → Taipei 101 → Elephant Mountain',
            titleTc: '射箭・空氣步槍・台北101・象山夜景',
            hotelRef: 'taipei',
            transitSummary: 'MRT Red Line + short walks (Zhongzheng → 101 → Xiangshan)',
            weatherExpected: '~21°C • Mild seasonal conditions',
            rainBackupAvailable: true,
            easyPlan: "If tired, keep archery and Taipei 101. Drop CKS first; skip the air-rifle session if same-day capacity is poor, and drop Elephant Mountain if legs are genuinely cooked.",
            leaveByTime: '9:30 AM from hotel',
            timeline: [
              {
                time: '9:30 AM – 11:00 AM',
                title: 'Zhongzheng Sports Center — Archery',
                titleTc: '臺北市中正運動中心・射箭',
                icon: 'target',
                notes: 'Leave Via at 9:30 AM and target the 10:00 AM opening-area session. Current local pricing is NT$300 for the first hour including bow, arrows, equipment and a short first-timer safety/form introduction — dramatically better value than a tourist workshop.',
                navigateTo: '台北市中正區信義路一段1號',
                addressTc: '台北市中正區信義路一段1號',
                guide: {
                  intro: 'Low-friction local sports activity in the exact CKS / Red Line corridor.',
                  steps: [
                    { label: 'Transit', detail: 'Leave Via Hotel around 9:30 AM and walk / take the simplest short MRT connection to Zhongzheng Sports Center, 信義路一段1號.' },
                    { label: 'Check-In', detail: 'Ask for the first-hour archery option and tell staff you are first-time users if applicable. Current setup includes equipment and roughly 10–15 minutes of basic safety/form instruction.' },
                    { label: 'Session', detail: 'Shoot for about one hour. Focus on form and a friendly 3-person score challenge rather than turning this into a training session.' },
                    { label: 'Exit', detail: 'Finish around 11:00 AM and walk toward Jin Feng for lunch. Do not add a paid English-language package.' }
                  ],
                  recheck: '48–72h before: reconfirm Thursday hours, walk-in policy and same-day capacity.'
                }
              },
              {
                time: '11:10 AM – 12:15 PM',
                title: 'Jin Feng Braised Pork Rice — Local Lunch',
                titleTc: '金峰魯肉飯・中正區午餐',
                icon: 'utensils',
                notes: 'A specific, high-volume local lunch beside the same CKS corridor. Keep it efficient because the 10m air-rifle range opens in the early afternoon.',
                navigateTo: '台北市中正區羅斯福路一段10號',
                addressTc: '台北市中正區羅斯福路一段10號',
                guide: {
                  intro: 'Named lunch between two local sports sessions — no cross-city detour.',
                  steps: [
                    { label: 'Order', detail: 'Use braised pork rice as the base and add braised egg, tofu, pork / meat side and vegetables so lunch is more protein-forward than a snack crawl.' },
                    { label: 'Queue Rule', detail: 'If the visible wait is >10–15 minutes, use a nearby simple rice/noodle shop or convenience-store protein meal rather than risking the 1:00 PM range opening.' },
                    { label: 'Reset', detail: 'Finish by ~12:15 PM, hydrate and walk back toward Zhongzheng Sports Center. Use the spare buffer for restroom / a short CKS-plaza preview, not another attraction.' }
                  ]
                }
              },
              {
                time: '1:00 PM – 1:40 PM',
                title: '10m Air-Rifle Shooting — Local Sports Session',
                titleTc: '10公尺空氣步槍射擊・中正運動中心',
                icon: 'crosshair',
                notes: 'Current local session price is NT$350/person including 30 pellets, target, air rifle and coach. It pairs naturally with the morning archery without buying a tourist shooting package.',
                navigateTo: '台北市中正區信義路一段1號',
                addressTc: '台北市中正區信義路一段1號',
                guide: {
                  intro: 'Short coached 10m air-rifle experience before the CKS first-timer pass.',
                  steps: [
                    { label: 'Check-In', detail: 'Return to the sports center around 12:50 PM and ask for the 10m air-rifle session. Follow staff safety / handling instructions exactly.' },
                    { label: 'Included Setup', detail: 'Current session includes the rifle, target, coach and 30 pellets per person. No need to buy additional rounds unless everyone is genuinely enjoying it and the next block remains safe.' },
                    { label: 'Friendly Competition', detail: 'Use the final targets for a simple 3-person score comparison. Keep the block to roughly 35–40 minutes.' },
                    { label: 'Exit', detail: 'Leave by ~1:40 PM and walk directly to the CKS plaza for the fast pass.' }
                  ],
                  recheck: '48–72h before: reconfirm Thursday 1:00 PM opening, walk-in rules and current session price.'
                }
              },
              {
                time: '1:45 PM – 2:25 PM',
                title: 'Chiang Kai-shek Memorial Hall — Fast Pass',
                titleTc: '中正紀念堂',
                icon: 'landmark',
                notes: 'Cap this at ~50 min: arrive before 2:00 PM, watch the outdoor honor guard if operating, take a quick plaza loop, and leave. / 以約50分鐘為上限，不深逛展館。',
                navigateTo: '台北市中正區中山南路21號',
                addressTc: '台北市中正區中山南路21號',
                guide: {
                  intro: 'Fast first-timer pass focused on the 2:00 PM honor guard and monumental plaza, not the museum/history exhibits.',
                  steps: [
                    { label: 'Transit', detail: 'Walk directly from Zhongzheng Sports Center to the CKS plaza; the two blocks are adjacent. Position yourselves around 1:50 PM for the 2:00 PM ceremony if it is operating.' },
                    { label: 'Drill Location', detail: 'Military honor guard ceremonial patrol and precision rifle drill is held outdoors on Democracy Boulevard (民主大道) directly in front of Memorial Hall stairs (not inside upper statue hall).' },
                    { label: '2:00 PM Ceremony', detail: 'Position yourselves along perimeter rope by 1:52 PM. Watch 15-minute silent synchronization drill and rifle inspection.' },
                    { label: 'Rain Rule', detail: 'If raining, outdoor military ceremonial drill is officially canceled.' },
                    { label: 'Courtyard Walk', detail: 'Do one quick plaza/photo loop after the ceremony. Skip interior exhibits unless the group specifically wants them.' }
                  ]
                }
              },
              {
                time: '3:45 PM – 5:30 PM',
                title: 'Taipei 101 Observatory (89F) at Sunset',
                titleTc: '台北101觀景台',
                icon: 'eye',
                notes: 'Enter at 3:45 PM for 5:03 PM winter sunset. Observatory ticket/check-in counter: Office Tower 1F. Reconfirm shortly before visit.',
                navigateTo: '台北市信義區信義路五段7號',
                addressTc: '台北市信義區信義路五段7號',
                guide: {
                  intro: '89th-floor panoramic sunset viewing and 660-tonne tuned mass damper.',
                  steps: [
                    { label: 'Ticket Counter', detail: 'Go to Office Tower 1F check-in lobby. Scan mobile ticket voucher for 3:45 PM entry slot.' },
                    { label: 'Elevator', detail: 'Board pressurized high-speed elevator; ascend from 5F to 89F in 37 seconds.' },
                    { label: 'Tuned Mass Damper', detail: 'Walk to center chamber to view massive 660-tonne golden steel pendulum sphere suspended between 87F and 92F that stabilizes tower against typhoons and earthquakes.' },
                    { label: 'West Window (Sunset)', detail: 'Position at western panoramic glass wall by 4:45 PM to catch 5:03 PM winter sunset casting long shadow over Taipei Basin.' },
                    { label: 'Skyline Lights', detail: 'Stay until 5:25 PM as Taipei’s street grid and elevated highways illuminate.' }
                  ]
                }
              },
              {
                time: '~6:00 PM – 7:15 PM',
                title: 'Elephant Mountain Night Hike',
                titleTc: '象山步道',
                icon: 'footprints',
                notes: 'Walk from 101 area or Xiangshan MRT Exit 2. 600 paved steps to Six Giant Rocks for iconic skyline view.',
                navigateTo: 'Xiangshan Trail, Xinyi District, Taipei',
                guide: {
                  intro: 'Nighttime cityscape viewpoint looking back at illuminated Taipei 101.',
                  steps: [
                    { label: 'Trailhead', detail: 'Take MRT Red Line 1 stop to Xiangshan Station Exit 2. Walk 10 minutes through Xiangshan Park to signed stone staircase entrance.' },
                    { label: 'The Climb', detail: 'Ascend ~600 steep, paved granite stairs. Take steady breathing pauses at midway viewing deck.' },
                    { label: 'Six Giant Rocks (六巨石)', detail: 'Reach summit viewing area. Admire postcard view of Taipei 101 rising illuminated above urban canopy.' },
                    { label: 'Safety', detail: 'Do not climb precariously onto smooth boulders in dark. Descend carefully along handrails.' }
                  ]
                }
              },
                            {
                time: '7:45 PM – 9:30 PM',
                title: 'Red Flower Queen + Yu Pin Yuan — Linjiang Night Market Dinner',
                titleTc: '紅花麻辣鹽水雞＋御品元冰火湯圓・臨江夜市',
                icon: 'utensils',
                notes: 'Two named, high-volume, well-reviewed anchors on/next to Linjiang. Protein-forward salted chicken first; dessert second. Browse freely, but no anonymous must-eat checklist.',
                navigateTo: '台北市大安區臨江街103號',
                addressTc: '台北市大安區臨江街103號',
                guide: {
                  intro: 'A clear two-stop market dinner after Elephant Mountain.',
                  steps: [
                    { label: 'Savory Anchor', detail: 'Start at Red Flower Queen Spicy Salted Chicken 紅花麻辣鹽水雞通化創始總店, 臨江街103號. Choose chicken plus vegetables / tofu and control spice to taste.' },
                    { label: 'Dessert', detail: 'Then walk to Yu Pin Yuan Iced & Hot Tangyuan 御品元冰火湯圓, 通化街39巷50弄31號. Share one hot-and-cold tangyuan bowl.' },
                    { label: 'Queue Rule', detail: 'Use a ~10–15 min hard cutoff at either shop. The market has infinite substitutes; the itinerary does not depend on one queue.' },
                    { label: 'Spa Decision', detail: 'By ~9:30 PM decide whether anyone still wants the optional Pine Foot head-spa. Do not rush dessert to make an optional treatment.' }
                  ]
                }
              },
              {
                time: '9:45 PM – 10:45 PM',
                title: 'Pine Foot Spa: 60-min Head Spa & Shampoo (Flexible)',
                titleTc: '松足體養生會館',
                icon: 'sparkles',
                notes: 'Optional warm head therapy, scalp pressure & SPA wash (~NT$1,290). Flexible same-day decision.',
                navigateTo: '台北市信義區基隆路二段94號',
                addressTc: '台北市信義區基隆路二段94號',
                guide: {
                  intro: 'Flexible head, neck, and scalp reset right outside Tonghua Night Market — zero travel friction.',
                  steps: [
                    { label: 'Flexibility Rule', detail: 'Because the group enjoyed 120-min bodywork yesterday at NARA, this is 100% optional. If everyone feels relaxed, head straight back to the hotel. If anyone wants head/scalp rejuvenation, step in.' },
                    { label: 'Walk Over', detail: 'Walk 2 minutes from Tonghua Market to Keelung Rd Sec 2 No 94 (松足體養生會館).' },
                    { label: 'Treatment Focus', detail: 'Request the 60-min Warm Head Therapy & SPA Shampoo (頭部舒壓 / SPA洗髮, ~NT$1,290). Emphasizes neck, scalp pressure points, warm water relaxation, and hair wash. No facial or beauty treatments.' },
                    { label: 'Return to Hotel', detail: 'Walk 8 minutes to Xinyi Anhe Station (信義安和站) on the Red Line for a direct one-seat ride back to Taipei Main Station (Exit Z10, ~14 min).' }
                  ],
                  exit: 'Depart by 10:50 PM. Direct Red Line ride back to Via Hotel.'
                }
              }
            ],
            rainPlan: 'Archery and the air-rifle session are indoors and survive rain. If conditions are wet, skip Elephant Mountain steps, keep Taipei 101 indoors, and use Songshan Cultural Park only if the group still wants an extra covered stop.',
            backups: {
              activity: {
                title: 'Songshan Cultural and Creative Park',
                titleTc: '松山文創園區',
                note: 'Indoor/covered Xinyi fallback if Elephant Mountain is dropped for rain.',
                navigateTo: '台北市信義區光復南路133號',
                addressTc: '台北市信義區光復南路133號'
              }
            },
            foodRecommendation: 'Jin Feng Braised Pork Rice 金峰魯肉飯 → Red Flower Queen 紅花麻辣鹽水雞 → Yu Pin Yuan 御品元冰火湯圓',
            proteinPlan: "Target ~150 g: make Jin Feng lunch meat/egg/tofu-forward, then use Red Flower Queen salted chicken as the main dinner protein. Add beef/pork, eggs or tofu at Linjiang before dessert; share tangyuan rather than using sweets as the meal. · 目標約150g：金峰午餐把肉、蛋、豆腐點足；晚餐以紅花鹽水雞作蛋白主力，再補牛／豬、蛋或豆腐，湯圓甜食分食即可。",
            insiderTip: 'The timing is deliberate: archery first, lunch during the midday gap, then the 1:00 PM air-rifle session. If the rifle range is full or delayed, skip it immediately rather than compressing CKS / Taipei 101.'
          },

          {
            id: 'day-07',
            dayNum: '07',
            shortLabel: 'KHH / 高雄',
            city: 'Kaohsiung / 高雄',
            dateString: 'Fri, Dec 04, 2026',
            timeZone: 'Asia/Taipei',
            title: 'THSR South → Lotus Pond → Bouldering → Ruifeng → Love River',
            titleTc: '高鐵南下・蓮池潭・抱石攀岩・瑞豐・愛河夜走',
            hotelRef: 'kaohsiung',
            transitSummary: 'THSR + short taxi/MRT hops + walking / 高鐵・短程叫車／捷運・步行',
            weatherExpected: '~25°C • Warm south; bouldering is indoors',
            rainBackupAvailable: true,
            easyPlan: "If tired after the train, shorten Boulder Space to ~75–90 minutes. Keep Ruifeng; make the Love River walk optional only if legs are genuinely done.",
            leaveByTime: '9:30 AM final checkout',
            timeline: [
              {
                time: '9:30 AM – 10:15 AM',
                title: 'Checkout ➔ Taipei Main ➔ THSR Boarding',
                titleTc: '退房 → 台北車站 → 高鐵上車',
                icon: 'train',
                notes: 'A normal 9:30 AM departure still gives enough margin for the 10:15 AM train because the hotel is close to Taipei Main. No artificial early gym today.',
                navigateTo: 'Taipei Main Station (HSR Gates), Zhongzheng District, Taipei',
                guide: {
                  intro: 'Simple transfer morning: checkout, short walk, board.',
                  steps: [
                    { label: 'Checkout', detail: 'Leave Via Hotel at 9:30 AM with all luggage. Do a quick cable/passport sweep before closing the room.' },
                    { label: 'Station', detail: 'Walk to Taipei Main Station and follow High Speed Rail / 高鐵 signs to the HSR concourse.' },
                    { label: 'Supplies', detail: 'Buy water or coffee only if needed. The real lunch is Shen Fu Wonton after arrival in Zuoying.' },
                    { label: 'Board', detail: 'Be through the HSR gate with enough time to find the assigned car for the 10:15 AM departure.' }
                  ]
                }
              },
              {
                time: '10:15 AM – 11:55 AM',
                title: 'THSR: Taipei ➔ Zuoying',
                titleTc: '台灣高鐵：台北 → 左營',
                icon: 'train',
                notes: 'Use the 1h40 ride to hydrate and rest. This is deliberately not another meal or activity block.',
                navigateTo: 'THSR Zuoying Station, Kaohsiung',
                guide: {
                  steps: [
                    { label: 'Stow', detail: 'Put large bags in the luggage area/appropriate racks and keep valuables with you.' },
                    { label: 'Reset', detail: 'Hydrate, charge phones and rest. Save appetite for the named Zuoying lunch.' },
                    { label: 'Arrival', detail: 'Retrieve luggage a few minutes before Zuoying and exit efficiently.' }
                  ]
                }
              },
              {
                time: '11:55 AM – 12:40 PM',
                title: 'Zuoying Bag Storage + Shen Fu Wonton Lunch',
                titleTc: '左營寄放行李＋神福餛飩午餐',
                icon: 'utensils',
                notes: 'Store luggage at/around the THSR station, then take the short hop to Shen Fu Wonton. This keeps the afternoon hands-free and makes the first Kaohsiung meal specific.',
                navigateTo: '高雄市左營區左營大路84號',
                addressTc: '高雄市左營區左營大路84號',
                guide: {
                  intro: 'Compact fuel stop before an active afternoon.',
                  steps: [
                    { label: 'Store Bags', detail: 'Use THSR Zuoying baggage storage / lockers. Keep passports, wallets and electronics in daypacks.' },
                    { label: 'Shen Fu', detail: 'Split a short taxi/app-dispatched ride to 神福餛飩, 左營大路84號.' },
                    { label: 'Order', detail: 'Get wonton soup/dry wontons plus a protein side. Keep the meal to roughly 20–25 minutes.' },
                    { label: 'Queue Rule', detail: 'If Shen Fu is >10 minutes to order/seat, use the station 7-ELEVEN/FamilyMart protein fallback and continue. Do not burn the afternoon on lunch.' }
                  ]
                }
              },
              {
                time: '12:45 PM – 1:35 PM',
                title: 'Lotus Pond Fast Walk — Dragon/Tiger Area, No Temple Checklist',
                titleTc: '蓮池潭快速散步・不做寺廟打卡清單',
                icon: 'footprints',
                notes: 'A short open-air first look at Kaohsiung while already in Zuoying. Walk the lake edge and architecture; do not turn it into a long religious-site circuit.',
                navigateTo: 'Lotus Pond, Zuoying District, Kaohsiung',
                addressTc: '高雄市左營區蓮池潭',
                guide: {
                  steps: [
                    { label: 'Walk', detail: 'Use the lakefront around the Dragon/Tiger Pagoda area as a 40–50 minute walking loop.' },
                    { label: 'Photo Rule', detail: 'Stop for architecture/lake photos when they are good, but skip temple interiors unless something genuinely interests you.' },
                    { label: 'Exit', detail: 'Head back toward New Zuoying Station/Global Mall by ~1:35 PM for the climbing block.' }
                  ]
                }
              },
              {
                time: '1:50 PM – 3:50 PM',
                title: 'Boulder Space Zuoying — 1:50 Check-in / ~2:00 Climb',
                titleTc: 'Boulder Space 圓石空間・室內抱石攀岩',
                icon: 'dumbbell',
                notes: 'A route-perfect sporty block directly inside the New Zuoying Station / Global Mall complex. Current official Global Mall listings confirm adult entry NT$350 + shoe rental NT$80 (NT$430 total), but do not publish a reliable current opening hour; treat 1:50 PM as arrival/check-in and begin only after the live posted opening.',
                navigateTo: 'Boulder Space 圓石空間攀岩場 左營店, Global Mall New Zuoying Station, Kaohsiung',
                addressTc: '高雄市左營區站前北路1號 環球購物中心新左營車站3樓',
                guide: {
                  intro: 'Route-perfect active block: two hours of indoor bouldering inside the station complex with essentially no routing penalty.',
                  steps: [
                    { label: 'Check-In', detail: 'Reach Boulder Space on Global Mall 3F around 1:50 PM. Confirm the live opening hour before travel; if doors are not open until 2:00 PM, use the few minutes for restroom/water and start immediately when admitted.' },
                    { label: 'Safety First', detail: 'Tell staff if anyone is new. Do the gym safety/fall briefing and start on the easiest bouldering problems. Use bouldering only; no rope/auto-belay component is needed for this itinerary.' },
                    { label: 'Session', detail: 'Rotate attempts and rest. Prioritize technique, balance and a broad set of easier routes instead of destroying forearms on one hard problem.' },
                    { label: 'Stop Fresh', detail: 'Finish around 3:45–3:50 PM while everyone still feels good. This is a travel activity, not a max-effort training day.' }
                  ],
                  recheck: '48–72h before: confirm Friday opening time and walk-in policy. Official online listings currently confirm NT$350 adult entry + NT$80 shoe rental but not dependable operating hours.'
                }
              },
              {
                time: '3:50 PM – 4:55 PM',
                title: 'Retrieve Bags ➔ Airline Inn Check-In',
                titleTc: '取行李 → 頭等艙飯店入住',
                icon: 'luggage',
                notes: 'Do the luggage chore now, before the evening. For 3 people, a tactical taxi from Zuoying to Airline Inn is reasonable if it saves the MRT + suitcase friction.',
                navigateTo: 'Airline Inn - Kaohsiung Station, No. 33 Jianguo 3rd Rd, Kaohsiung',
                addressTc: '高雄市三民區建國三路33號',
                guide: {
                  steps: [
                    { label: 'Collect', detail: 'Return to the station storage point and collect every bag.' },
                    { label: 'Move South Once', detail: 'Compare Red Line vs Uber / 55688 / LINE GO. With 3 adults + luggage, take the car if it materially simplifies the transfer.' },
                    { label: 'Check-In', detail: 'Check into Airline Inn, drop all luggage and take a fast 10–15 minute reset. Leave again around 5:00 PM.' }
                  ]
                }
              },
              {
                time: '5:15 PM – 7:30 PM',
                title: "Zeng's Fujian Fried Noodles + Angel Fried Chicken — Ruifeng Dinner",
                titleTc: '曾氏福建炒麵＋天使雞排・瑞豐晚餐',
                icon: 'utensils',
                notes: 'Use Ruifeng as the lively dinner block, but keep it to a two-anchor meal plus one browse lap rather than a ten-stall checklist.',
                navigateTo: '高雄市左營區南屏路 瑞豐夜市第一排',
                addressTc: '高雄市左營區南屏路／裕誠路 瑞豐夜市',
                guide: {
                  intro: 'Specific, high-volume night-market dinner after climbing.',
                  steps: [
                    { label: 'Anchor 1', detail: "Start at Zeng's Fujian Fried Noodles 曾氏福建炒麵 瑞豐總店. Share one plate." },
                    { label: 'Anchor 2', detail: 'Then share Angel Fried Chicken 天使雞排 on Yucheng Road. Add another meat/tofu/egg item only if the line is short.' },
                    { label: 'Browse', detail: 'Do one full market lap for atmosphere and whatever genuinely looks good. Do not queue just because a stall is viral.' },
                    { label: 'Queue Rule', detail: 'Any named anchor >10–15 min: skip it. If rain makes Ruifeng miserable, use Din Tai Fung Kaohsiung Branch at Hanshin Arena B1 instead.' },
                    { label: 'Exit', detail: 'Leave by about 7:30 PM so the night still has a proper outdoor Kaohsiung finish.' }
                  ]
                }
              },
              {
                time: '7:50 PM – 9:20 PM',
                title: 'Heart of Love River — Lit Riverside Night Walk',
                titleTc: '愛河之心・夜間河濱散步',
                icon: 'footprints',
                notes: 'A proper after-dinner walk instead of returning to the hotel at 8 PM. The Heart of Love River is open 24 hours and is designed around illuminated water, bridges and riverside paths.',
                navigateTo: 'Heart of Love River, Kaohsiung',
                addressTc: '高雄市三民區博愛一路與同盟一路口',
                guide: {
                  intro: 'Low-friction night scenery on the way back toward central Kaohsiung.',
                  steps: [
                    { label: 'Transfer', detail: 'From Ruifeng/Kaohsiung Arena, head south toward the Heart of Love River using the simplest MRT + walk or short taxi.' },
                    { label: 'Loop', detail: 'Walk both sides of the lit water/bridge area at an easy pace. This is decompression after the climbing + market blocks, not another attraction checklist.' },
                    { label: 'Photos', detail: 'Use the reflections and bridge lighting for night photos; keep moving rather than camping at one viewpoint.' },
                    { label: 'Hotel', detail: 'Leave around 9:20 PM and return to Airline Inn by roughly 9:45–10:00 PM.' }
                  ]
                }
              }
            ],
            rainPlan: 'Boulder Space is indoors, so the main athletic block survives rain. In steady/heavy rain, skip Lotus Pond and the Love River walk. Keep the climb; use Ruifeng only if conditions are comfortable, otherwise switch to Din Tai Fung at Hanshin Arena and return to the hotel.',
            backups: {
              foods: [
                {
                  title: 'Din Tai Fung Kaohsiung Branch',
                  titleTc: '鼎泰豐 高雄店',
                  note: 'Named indoor dinner fallback if rain makes Ruifeng unpleasant. Use only with <=15 min wait.',
                  navigateTo: '高雄市左營區博愛二路777號B1',
                  addressTc: '高雄市左營區博愛二路777號B1'
                }
              ]
            },
            foodRecommendation: 'Shen Fu Wonton 神福餛飩 → 曾氏福建炒麵 → 天使雞排',
            proteinPlan: 'Target ~150 g: breakfast before checkout should be protein-forward; Shen Fu is the real lunch; after bouldering use Ruifeng for chicken/beef/seafood/egg/tofu before fried starches and dessert. Carry one simple protein drink/soy milk only if needed. · 目標約150g：退房前先用高蛋白早餐打底；神福餛飩是正式午餐；抱石後在瑞豐先吃雞、牛、海鮮、蛋／豆腐，再分食炸物與甜點。不足時再補一份蛋白飲／無糖豆漿即可。',
            insiderTip: 'The sporty replacement is intentionally at New Zuoying Station: almost no detour, weather-proof, inexpensive, and easy to stop after ~2 hours. The evening now continues through Ruifeng and a Love River night walk instead of ending at hotel check-in.'
          },

          {
            id: 'day-08',
            dayNum: '08',
            shortLabel: 'Tainan / 台南',
            city: 'Tainan Day Trip / 台南一日',
            dateString: 'Sat, Dec 05, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Tainan Fast Track: Markets → Hayashi → Anping → Wusheng',
            titleTc: '台南高效率一日：市場・林百貨・安平・武聖夜市',
            hotelRef: 'kaohsiung',
            transitSummary: 'TRA Express Train (~35m direct)',
            weatherExpected: '~26°C • Warm southern climate',
            rainBackupAvailable: true,
            easyPlan: "If tired, drop Anping and keep central Tainan, Shennong Street, and Wusheng Night Market.",
            leaveByTime: '9:30 AM from hotel',
            timeline: [
              {
                time: '~10:00 AM – 10:35 AM',
                title: '~10:00 AM Target TRA Express: Kaohsiung ➔ Tainan',
                titleTc: '台鐵：高雄站 → 台南站',
                icon: 'train',
                notes: 'Take regular TRA train directly to downtown Tainan station, not HSR. Confirm exact TRA timetable closer to trip.',
                navigateTo: 'Kaohsiung Main Station, Sanmin District, Kaohsiung',
                guide: {
                  intro: 'Direct regular rail transit into historic heart of Tainan.',
                  steps: [
                    { label: 'Station', detail: 'Board at Kaohsiung Main Station (高雄車站), NOT Zuoying. Regular TRA services stop at downtown Tainan Station.' },
                    { label: 'Train Selection', detail: 'Confirm actual TRA train shortly before departure. For any reserved-service train requiring a ticket/seat, buy appropriate ticket. Do not assume EasyCard alone is valid for selected express.' },
                    { label: 'Arrival', detail: 'Step off at Tainan Station (台南車站). Exit West Gate. Compare Uber / 55688 / LINE GO to Shuixian Gong and use the best ETA/price; street taxi only if immediately convenient and metered.' }
                  ]
                }
              },
                            {
                time: '10:50 AM – 11:25 AM',
                title: 'Shuixian Gong Morning Market — Working-Market Walk',
                titleTc: '水仙宮市場・在地市場觀察',
                icon: 'store',
                notes: 'Treat this as a market experience, not a food stop. Lunch is deliberately saved for the named You-Ai Beef Soup anchor 40 minutes later.',
                navigateTo: '台南市中西區海安路二段230號',
                addressTc: '台南市中西區海安路二段230號',
                guide: {
                  intro: 'Short working-market pass before vendors wind down.',
                  steps: [
                    { label: 'Walk', detail: 'Loop fresh produce / seafood / dry-goods aisles without blocking local shoppers.' },
                    { label: 'No Food Mission', detail: 'Do not chase individual market stalls here. You have a specific lunch shortly; buying random snacks makes the Tainan food plan less clear.' },
                    { label: 'Photos', detail: 'Ask before photographing vendors up close and keep moving through active aisles.' },
                    { label: 'Exit', detail: 'Leave by 11:25 AM and walk to Chikan Tower.' }
                  ]
                }
              },
              {
                time: '11:35 AM – 12:00 PM',
                title: 'Chikan Tower — Quick Exterior/Highlights Pass',
                titleTc: '赤崁樓',
                icon: 'landmark',
                notes: '25-minute first-timer pass only. See the surviving brickwork/courtyard, then move on; no deep history stop.',
                navigateTo: '台南市中西區民族路二段212號',
                addressTc: '台南市中西區民族路二段212號',
                guide: {
                  intro: 'Former Dutch Fort Provintia administrative bastion built in 1653.',
                  steps: [
                    { label: 'Walk Over', detail: 'Walk 8 minutes east from Shuixian Gong along Minzu Road Sec. 2.' },
                    { label: 'Bixi Steles', detail: 'View line of 9 imperial stone steles carried on backs of mythic dragon-turtle creatures (贔屭) awarded by Emperor Qianlong.' },
                    { label: 'Dutch Foundations', detail: 'Examine surviving 17th-century red-brick bastion walls bonded with oyster shell mortar.' },
                    { label: 'Courtyard', detail: 'Ascend wooden pavilion stairs for peaceful view over koi ponds.' }
                  ]
                }
              },
                            {
                time: '12:10 PM – 12:55 PM',
                title: 'You-Ai Beef Soup (Anping backup: A-Cai Gubao) — Tainan Lunch',
                titleTc: '友愛牛肉湯（安平備案：阿財牛肉湯）',
                icon: 'utensils',
                notes: 'Specific central-Tainan fresh-beef-soup anchor with strong review depth. If the day slips until Anping, do not backtrack: use A-Cai Beef Soup on Gubao Street, beside the Anping fort/tree-house cluster.',
                navigateTo: '台南市中西區友愛街109號',
                addressTc: '台南市中西區友愛街109號',
                guide: {
                  intro: 'Fresh Tainan beef soup with an explicit geographic fallback.',
                  steps: [
                    { label: 'Transit', detail: 'From Chikan Tower, allow roughly 10–12 minutes on foot to You-Ai Beef Soup; use a short app-dispatched taxi only if heat, rain or timing makes the walk annoying. The schedule no longer assumes a 5-minute teleport.' },
                    { label: 'Primary', detail: 'Eat at You-Ai Beef Soup 友愛牛肉湯, 友愛街109號. Saturday service currently runs through 3 PM, comfortably covering this slot.' },
                    { label: 'Order', detail: 'For 3: order 2 beef soups plus one tendon/brisket or other beef dish and rice. Ask for extra beef if needed for the protein target.' },
                    { label: 'Queue Rule', detail: 'If the wait is >10–15 min, do not burn the schedule. If you are already running late toward Anping, defer lunch to A-Cai Beef Soup 阿財牛肉湯 古堡街店 (古堡街5號) beside the Anping cluster instead of backtracking.' },
                    { label: 'Hard Exit', detail: 'Leave by ~12:55 PM for Hayashi / Confucius district.' }
                  ]
                }
              },
              {
                time: '1:05 PM – 1:55 PM',
                title: 'Hayashi Department Store + Confucius District — Speed Pass',
                titleTc: '林百貨＋孔廟文化街區・快逛',
                icon: 'shopping-bag',
                notes: 'Keep this under an hour. Hayashi is the point; the Confucius Temple district is a short street/exterior pass, not a long religious/history visit. / 林百貨約30分鐘＋孔廟街區外圍約15–20分鐘。',
                navigateTo: '台南市中西區忠義路二段63號',
                addressTc: '台南市中西區忠義路二段63號',
                guide: {
                  intro: 'Fast retro-shopping/architecture stop before using a short metered taxi to Anping.',
                  steps: [
                    { label: 'Hayashi First', detail: 'Spend ~25–30 min inside Hayashi: ride the vintage elevator, browse Taiwan-made goods, and do the rooftop/view quickly. Do not turn it into a shopping marathon.' },
                    { label: 'Confucius District', detail: 'Walk the surrounding Fuzhong Street / Confucius Temple cultural block for ~15–20 min, then skip a long interior religious/history visit.' },
                    { label: 'Taxi Out', detail: 'Leave around 1:55 PM and use a metered taxi directly to Anping Tree House / Fort area. For 3 people, the small split fare is worth the large bus-time saving; use Uber / 55688 / LINE GO dispatch rather than waiting around for a street cab.' }
                  ],
                  exit: 'Metered taxi toward Anping by ~1:55 PM.'
                }
              },
              {
                time: '2:15 PM – 3:25 PM',
                title: 'Anping Tree House + Fort + Old Street — 70-min Speed Run',
                titleTc: '安平樹屋・安平古堡・安平老街',
                icon: 'landmark',
                notes: 'Prioritize the visually unusual Tree House. Keep the entire Anping cluster to ~70 min: Tree House ~25 min, Fort ~15 min, Old Street/snacks ~20 min plus short walks. / 安平整段控制約70分鐘。',
                navigateTo: '台南市安平區古堡街108號',
                addressTc: '台南市安平區古堡街108號',
                guide: {
                  intro: 'Taiwan’s oldest Dutch settlement fortress and an overgrown colonial warehouse.',
                  steps: [
                    { label: 'Tree House First', detail: 'Go straight to Anping Tree House for ~25 min: banyan roots, upper walkways and photos. This is the area’s most visually distinctive stop.' },
                    { label: 'Fort Quick Pass', detail: 'Move to Anping Fort for ~15–20 min. Do the key rampart/viewpoint/photo stop only; skip deep exhibit reading.' },
                    { label: 'Old Street Snacks', detail: 'Use the remaining ~20–25 min for Anping Old Street: one snack/drink, quick browse, then leave. No souvenir-store crawl.' },
                    { label: 'Taxi Rule', detail: 'At ~3:25–3:30 PM, use a metered taxi back toward Shennong / Haian. Split 3 ways, this is a high-value time saver versus slow local buses.' }
                  ]
                }
              },
              {
                time: '3:50 PM – 4:35 PM',
                title: 'Shennong Street & Five Channels Alleys',
                titleTc: '神農街 & 五條港街區',
                icon: 'camera',
                notes: '45-minute atmosphere/photo walk only. You are here for the lanes and evening feel, not a historical deep dive.',
                navigateTo: '台南市中西區神農街',
                addressTc: '台南市中西區神農街',
                guide: {
                  intro: 'Qing Dynasty merchant port alley with atmospheric wooden shophouses and evening lanterns.',
                  steps: [
                    { label: 'Entry', detail: 'Step into Shennong Street from Haian Road. Notice narrow 4-meter alley width suited for historic cargo portering.' },
                    { label: 'Architecture', detail: 'Look at preserved two-story wooden facades with wooden loading doors on upper floors once used to winch cargo from river barges.' },
                    { label: 'Artisans', detail: 'Peek into independent leather workshops, retro ceramic studios, and small printmakers.' },
                    { label: 'Golden Hour', detail: 'Watch red and yellow lanterns illuminate shophouse eaves as dusk settles over Five Channels district.' }
                  ]
                }
              },
                            {
                time: '4:35 PM – 5:20 PM',
                title: 'Ba Bao Bin Yuan Zai Hui — Guohua Sweet Break',
                titleTc: '八寶彬圓仔惠・國華街甜品休息',
                icon: 'utensils',
                notes: 'One named dessert stop instead of grazing through random Guohua queues. Keep it light because Wusheng dinner starts shortly.',
                navigateTo: '台南市中西區金華路四段71號',
                addressTc: '台南市中西區金華路四段71號',
                guide: {
                  steps: [
                    { label: 'Walk', detail: 'Use the Guohua/Haian lanes as a compact street walk after Shennong.' },
                    { label: 'Dessert', detail: 'At 八寶彬圓仔惠 金華店, share one shaved-ice / tangyuan-style dessert among 3 rather than each ordering a full bowl.' },
                    { label: 'Queue Rule', detail: 'If >10 minutes, skip dessert entirely. Wusheng is the real dinner.' },
                    { label: 'Transfer', detail: 'Around 5:20–5:30 PM, use a short metered/app-dispatched taxi to Wusheng so you arrive near opening.' }
                  ]
                }
              },
                            {
                time: '6:00 PM – 8:00 PM',
                title: 'A-Cheng Beef Soup + A-Yao-Si Egg Cakes — Wusheng Dinner',
                titleTc: '阿誠牛肉湯＋阿堯師雞蛋糕・武聖夜市晚餐',
                icon: 'utensils',
                notes: 'Two named, well-reviewed Wusheng anchors. The market itself is still the experience, but purchases are no longer based on random viral lists.',
                navigateTo: '台南市中西區武聖路69巷42號',
                addressTc: '台南市中西區武聖路69巷42號',
                guide: {
                  intro: 'A concise Wusheng market plan with a savory anchor and one traditional dessert.',
                  steps: [
                    { label: 'First Lap', detail: 'Walk one lap for atmosphere and to locate the two named anchors.' },
                    { label: 'Savory Anchor', detail: 'Eat at A-Cheng Beef Soup 阿誠牛肉湯, 武聖路69巷40弄4號. Current Saturday dinner hours are 5–8 PM, so do this first.' },
                    { label: 'Dessert', detail: 'If operating at its Wusheng stall, share A-Yao-Si Egg Cakes 阿堯師雞蛋糕 after the savory meal. The Wusheng stall currently operates Saturday evening.' },
                    { label: 'Queue Rule', detail: 'Hard cutoff ~10–15 min per stall. Skip anything longer; there is no third must-eat stop.' },
                    { label: 'Exit', detail: 'Finish by 7:50–8:00 PM and taxi directly to Tainan Station for the return train.' }
                  ],
                  recheck: '48–72h before: reconfirm Saturday Wusheng operating night and A-Yao-Si stall appearance.'
                }
              },
              {
                time: '~8:25 PM – 9:15 PM',
                title: '~8:25–9:15 PM Target Return TRA Express to Kaohsiung',
                titleTc: '台鐵：台南站 → 高雄站',
                icon: 'train',
                notes: 'Short metered taxi to Tainan Station. Confirm exact TRA timetable closer to trip. Direct train back to Kaohsiung beds.',
                navigateTo: 'Tainan Railway Station, East District, Tainan',
                guide: {
                  intro: 'Direct return rail ride back to Kaohsiung beds.',
                  steps: [
                    { label: 'Station Entrance', detail: 'Metered taxi drops at Tainan Railway Station. Check platform departure board for next Tze-Chiang or EMU3000 express train bound for Kaohsiung.' },
                    { label: 'Relax', detail: 'Ride 35 minutes south. Rest legs on smooth rail journey.' },
                    { label: 'Arrival', detail: 'Alight at Kaohsiung Station and walk the short distance back to the hotel; taxi only if everyone is cooked.' }
                  ]
                }
              }
            ],
            rainPlan: 'If rain makes Anping unpleasant, drop Anping and keep the day central: Hayashi / covered Guohua-Haian food lanes / Blueprint Creative Park / cafés. Do not replace it with a museum unless the group specifically wants one.',
            backups: {
              activity: {
                title: 'Blueprint Culture & Creative Park',
                titleTc: '藍晒圖文創園區',
                note: 'Central Tainan fallback if rain makes Anping unpleasant.',
                navigateTo: '台南市南區西門路一段689巷',
                addressTc: '台南市南區西門路一段689巷'
              },
              foods: [
                {
                  title: 'A-Cai Beef Soup',
                  titleTc: '阿財牛肉湯 平豐店',
                  note: 'Named Anping lunch fallback explicitly referenced in the You-Ai timeline. Use only if lunch slips east/west enough that backtracking to central Tainan is dumb.',
                  navigateTo: '台南市安平區平豐路277號',
                  addressTc: '台南市安平區平豐路277號'
                }
              ]
            },
            foodRecommendation: '友愛牛肉湯（late-day backup: 阿財牛肉湯）→ 八寶彬圓仔惠 → 阿誠牛肉湯 / 阿堯師雞蛋糕',
            proteinPlan: 'Target ~150 g: Tainan is easy if you use fresh beef soup as the lunch anchor—order extra beef and add eggs/tofu or another meat dish. At Wusheng prioritize grilled chicken, squid, oysters/seafood and meat skewers; share danzai noodles, wa kuih and sweets. · 目標約150g：台南最簡單的做法是把溫體牛肉湯當午餐主角，可加牛肉，再配蛋／豆腐或另一份肉。武聖夜市優先烤雞、魷魚、蚵仔／海鮮與肉串；擔仔麵、碗粿、甜食分食。',
            insiderTip: 'Tainan transport rule: walk within each cluster; between distant clusters use a metered/app-dispatched taxi (Uber / 55688 / LINE GO) when it saves ~15+ minutes or an awkward transfer. Check Uber only as a fare/pickup comparison. Do not optimize the day around slow local buses.'
          },

          {
            id: 'day-09',
            dayNum: '09',
            shortLabel: 'Alishan / 阿里山',
            city: 'Chiayi / Alishan',
            dateString: 'Sun, Dec 06, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Alishan High-Mountain Forest Day Trip',
            titleTc: '阿里山國家森林遊樂區・高山森林一日遊',
            hotelRef: 'kaohsiung',
            transitSummary: 'THSR + Reserved 7329 Bus + Forest Railway / 高鐵・7329公車・林鐵',
            weatherExpected: 'High-elevation mountain • much colder than Kaohsiung • recheck 48h before',
            rainBackupAvailable: true,
            easyPlan: "If the mountain forecast is poor or transport is disrupted, do NOT force Alishan. Run the full Cijin coastal day today instead; Monday remains massage + shrimp fishing with a later start.",
            leaveByTime: '7:50 AM from hotel — justified early exception',
            timeline: [
              {
                time: '7:50 AM – ~9:10 AM',
                title: 'Kaohsiung ➔ THSR Zuoying ➔ THSR Chiayi',
                titleTc: '高雄 → 高鐵左營站 → 高鐵嘉義站',
                icon: 'train',
                notes: 'This is still an early exception, but 6:50 AM was unnecessary. Leave around 7:50 AM and use MRT/taxi + THSR to reach Chiayi by ~9:10 AM, protecting the official 9:30 AM reserved 7329 bus.',
                navigateTo: 'THSR Chiayi Station, Taibao City, Chiayi County',
                guide: {
                  intro: 'Sleep-friendly compromise built around the official 9:30 AM Alishan bus rather than the 8:40 AM departure.',
                  steps: [
                    { label: 'Breakfast First', detail: 'Leave Airline Inn around 7:50 AM. Eat a fast protein-forward breakfast beforehand or carry it: tea eggs + unsweetened soy milk + chicken/lean meat or equivalent. Add one portable protein item for the mountain.' },
                    { label: 'Get to Zuoying', detail: 'Use MRT Red Line from Kaohsiung Main to Zuoying by default. If running late, use a Uber / 55688 / LINE GO because missing the reserved mountain bus is far more expensive than one tactical taxi.' },
                    { label: 'THSR Selection', detail: 'Book the practical morning THSR after the Dec 6 schedule is available. Hard requirement: reach THSR Chiayi around 9:05–9:10 AM so the reserved-seat check-in is stress-free.' },
                    { label: 'Bus Bay', detail: 'At THSR Chiayi, use Exit 2 / Platform 7 for the Alishan A-line. Have the reserved-seat QR ready and complete check-in by ~9:20 AM (officially ≥10 min before departure).' }
                  ],
                  recheck: 'Confirm exact Zuoying→Chiayi THSR train and platform after reservations open.'
                }
              },
              {
                time: '9:30 AM – 12:00 PM',
                title: 'Reserved Bus 7329: THSR Chiayi ➔ Alishan',
                titleTc: '台灣好行 7329：高鐵嘉義站 → 阿里山',
                icon: 'bus',
                notes: 'Current official A-line timetable includes 9:30 AM THSR Chiayi departure → 12:00 PM Alishan arrival. Current one-way fare NT$283. Reserve actual seats for the Sunday round trip.',
                navigateTo: 'Alishan Transport Station, Alishan Township, Chiayi County',
                addressTc: '嘉義縣阿里山鄉阿里山轉運站',
                guide: {
                  intro: 'Direct climb from the western plain to roughly 2,200+ m forest zone without a private driver.',
                  steps: [
                    { label: 'Seat Rule', detail: 'Use the reserved-seat booking for all 3 travelers and keep the QR accessible offline. Report ≥10 min early; if you are not checked in by 5 min before departure, the operator can release the seat to the standby queue. EasyCard/cash walk-up remains a fallback, not the Sunday plan.' },
                    { label: 'Motion Comfort', detail: 'The final mountain section is winding. Sit facing forward if anyone is motion-sensitive; keep water and motion-sickness medication accessible if normally used.' },
                    { label: 'Layer Up', detail: 'Before arrival, put on the packed warm layer. Alishan can feel dramatically colder/windier than Kaohsiung even when the south is warm.' },
                    { label: 'Public-Transit Entry Discount', detail: 'Keep the bus ticket/ride proof. The forest recreation area currently offers the NT$150 standard-discount admission to visitors holding public-transport tickets.' }
                  ],
                  recheck: 'Reconfirm 7329 operations, mountain-road conditions and reservation details 48–72h beforehand.'
                }
              },
                            {
                time: '12:00 PM – 12:35 PM',
                title: 'Enter Alishan + Shan Bin Restaurant — Fast Mountain Lunch',
                titleTc: '進入阿里山＋山賓餐廳快速午餐',
                icon: 'utensils',
                notes: 'Do not sprint for the 11:30 Zhaoping branch train after a 2.5-hour bus. Eat a named, well-reviewed mountain lunch first, then walk into the forest. The Shenmu train later still gives you the rail experience.',
                navigateTo: '山賓餐廳, 阿里山國家森林遊樂區',
                guide: {
                  intro: 'More resilient arrival sequence: restroom + food + walking, with no fragile 20-minute train connection.',
                  steps: [
                    { label: 'Enter', detail: 'Clear the recreation-area gate after the noon bus arrival and use the restroom immediately.' },
                    { label: 'Lunch', detail: 'Go to Shan Bin Restaurant 山賓餐廳 for a quick hot lunch. Keep the order simple and protein-forward; share dishes rather than waiting on a large banquet.' },
                    { label: 'Queue Rule', detail: 'If seating will take >10 minutes, skip it and use packed 7-ELEVEN/FamilyMart eggs, soy milk, chicken/lean meat plus one convenient hot snack. Do not delay the forest.' },
                    { label: 'Rail Decision', detail: 'Do not chase a branch train on arrival. Walk straight into the forest after lunch; keep the 3:40 PM Shenmu train only if your walking route naturally reaches it with buffer.' }
                  ],
                  exit: 'Be moving into the Zhaoping / Sister Ponds forest route by ~12:35 PM.'
                }
              },
              {
                time: '~12:35 PM – 3:20 PM',
                title: 'Zhaoping ➔ Sister Ponds ➔ Giant Tree Forest Walk',
                titleTc: '沼平 → 姊妹潭 → 巨木群森林健行',
                icon: 'footprints',
                notes: 'This is the point of the day: roughly 2h45 of cedar/cypress forest, elevated trails and giant trees after the compact lunch. Move efficiently, skip religious detours, and begin positioning for Shenmu Station before the 3:40 PM train.',
                navigateTo: 'Zhaoping Park, Alishan Township, Chiayi County',
                addressTc: '嘉義縣阿里山鄉沼平公園',
                guide: {
                  intro: 'Continuous high-mountain forest walk focused on scenery and steady movement.',
                  steps: [
                    { label: 'Zhaoping & Forest', detail: 'Start through Zhaoping Park and the signed forest boardwalks. Keep a steady walking pace rather than lingering at every photo platform.' },
                    { label: 'Sister Ponds', detail: 'Pass Sister Ponds (姊妹潭) as a short scenic stop. Photos, quick loop, continue.' },
                    { label: 'Temple Rule', detail: 'If a route passes a shrine/temple, treat it as a navigation landmark only. Do not allocate a dedicated religious visit.' },
                    { label: 'Tea/Water', detail: 'Lunch is already handled at Shan Bin. Carry water and, if convenient, try a small Alishan high-mountain tea; do not create another sit-down stop.' },
                    { label: 'Giant Trees', detail: 'Continue toward the Giant Tree Trail / Sacred Tree area. Prioritize the largest cypress/cedar sections and forest atmosphere over checklist-style monument stops.' },
                    { label: 'Pace Check', detail: 'By ~3:10–3:15 PM, begin positioning toward Shenmu Station. Target the station by ~3:25 PM; the reserved 4:40 PM bus down is the hard constraint.' }
                  ]
                }
              },
              {
                time: '3:20 PM – 4:25 PM',
                title: 'Paper Ticket → 3:40 Shenmu Train → Bus Buffer',
                titleTc: '神木線林鐵返回・預留公車緩衝',
                icon: 'train',
                notes: 'Target the currently listed 3:40 PM Shenmu → Alishan train (arrives ~3:47 PM). For the Sun Dec 6 ride, start checking Fri Nov 20 at 6:00 AM Taiwan time because Friday sales can open the following weekend. Branch-line travel requires a physical paper ticket; no branch e-ticket. If unavailable, walk back early enough to reach the Alishan Transit Station by ~4:20 PM.',
                navigateTo: 'Shenmu Station, Alishan Township, Chiayi County',
                addressTc: '嘉義縣阿里山鄉神木車站',
                guide: {
                  intro: 'The heritage train itself is only seven minutes; most of this block is deliberate ticket, walking and bus-check-in margin.',
                  steps: [
                    { label: 'Ticket Rule', detail: 'Start checking Fri Nov 20 at 6:00 AM Taiwan time for the Dec 6 branch ride. Branch-line travel requires a physical paper ticket; follow the current Forest Railway / 7-ELEVEN ibon collection process rather than relying on an e-ticket.' },
                    { label: 'Preferred Train', detail: 'Be at Shenmu Station by roughly 3:25–3:30 PM. The official branch timetable lists Shenmu 3:40 PM → Alishan 3:47 PM; use it only with the physical paper tickets secured.' },
                    { label: 'No-Wait Rule', detail: 'If the train is delayed, full, or uncertain, walk back. The 4:40 PM reserved bus is much more important than squeezing in a second railway ride.' },
                    { label: 'Final Buffer', detail: 'After the 3:47 PM arrival, walk directly toward Alishan Transit Station and target the bus queue by ~4:15–4:20 PM. Restroom/water only if the line remains protected; the reserved 4:40 PM bus is the hard anchor.' }
                  ],
                  recheck: 'Start ticket check Fri Nov 20 at 6:00 AM Taiwan time; then recheck Shenmu branch operation/status the morning of Dec 6.'
                }
              },
              {
                time: '4:40 PM – ~8:15 PM',
                title: 'Reserved 7329 ➔ THSR Chiayi ➔ Kaohsiung',
                titleTc: '7329下山 → 高鐵嘉義站 → 高雄',
                icon: 'train',
                notes: 'Current official return: 4:40 PM Alishan → 7:10 PM THSR Chiayi. Take the first practical reserved/non-reserved THSR south to Zuoying, then MRT to the hotel. Exact final arrival depends on the released HSR timetable.',
                navigateTo: 'THSR Chiayi Station, Taibao City, Chiayi County',
                guide: {
                  intro: 'Protected return from the mountain without changing hotels or carrying luggage.',
                  steps: [
                    { label: '4:40 Bus', detail: 'Board the reserved 7329 at Alishan Transit Station. Current timetable reaches THSR Chiayi at 7:10 PM.' },
                    { label: 'THSR Home', detail: 'Transfer to the first sensible southbound HSR for Zuoying. Do not over-optimize a 10-minute difference if it creates a risky bus-to-rail connection.' },
                    { label: 'Post-Return Food', detail: 'Do not schedule another destination after this 13-hour mountain day. If genuinely hungry after reaching Kaohsiung, use the 7-ELEVEN / FamilyMart by Kaohsiung Station for eggs, soy milk, chicken or another quick protein top-up, then go straight to the hotel.' },
                    { label: 'Recovery', detail: 'Pack light for Monday Cijin and sleep. No gym Monday morning; today already includes an early start, altitude and several hours of walking.' }
                  ]
                }
              },
              {
                time: '~8:35 PM – 9:35 PM',
                title: 'Old Jiang Red Tea Milk — Flexible Kaohsiung Late Supper',
                titleTc: '老江紅茶牛奶・高雄彈性宵夜',
                icon: 'utensils',
                notes: 'If the HSR connection runs normally, finish the long mountain day with one easy local 24-hour stop near the hotel instead of another attraction. If you are exhausted or delayed, skip it cleanly.',
                navigateTo: '高雄市新興區南台路51號',
                addressTc: '高雄市新興區南台路51號',
                guide: {
                  intro: 'A low-stakes late supper after five hours of mountain-bus travel.',
                  steps: [
                    { label: 'Arrival Gate', detail: 'Only go if you are back in central Kaohsiung by roughly 8:35–8:45 PM and still want food. Otherwise go straight to the hotel.' },
                    { label: 'Order', detail: 'At 老江紅茶牛奶 南台總店, share the charcoal-style milk tea and add ham/egg toast or another egg/meat item as appetite requires.' },
                    { label: 'No Queue Mission', detail: 'This is a convenient local closeout, not a famous-food objective. If it is unexpectedly annoying, use the convenience store and sleep.' },
                    { label: 'Hotel', detail: 'Walk/taxi back to Airline Inn and aim to be in the room by roughly 10:00 PM.' }
                  ]
                }
              }
            ],
            rainPlan: 'If Alishan has heavy rain, dangerous wind, mountain-road disruption, railway suspension, or clearly poor visibility, cancel rather than forcing a 5-hour transport day. Run the FULL Cijin coastal day on Sunday instead. Do not move Alishan to Monday because the fixed 2:15 PM massage makes the mountain logistics incompatible.',
            backups: {
              activity: {
                title: 'Full Cijin Coastal Day',
                titleTc: '旗津完整海岸日',
                note: 'Weather/transport fallback: run the Cijin coastal day instead of forcing a poor-visibility Alishan transit marathon.',
                navigateTo: 'Cijin Ferry Station, Qijin District, Kaohsiung'
              }
            },
            foodRecommendation: 'Shan Bin Restaurant 山賓餐廳 → Old Jiang Red Tea Milk 老江紅茶牛奶 after Kaohsiung return if hungry; packed 7-ELEVEN / FamilyMart protein remains the no-delay fallback',
            proteinPlan: 'Target ~150 g without forcing a late heavy dinner: front-load ~45–55 g before/around the HSR, carry ~35–45 g of portable protein (tea eggs, unsweetened soy milk, chicken/lean meat, yogurt if practical), get another ~30–45 g from the hot Shan Bin lunch, then use Old Jiang ham/egg toast or a convenience-store protein top-up only if still hungry after returning to Kaohsiung. Local Alishan tea/snacks stay in the day; convenience food supports the target rather than replacing the experience. · 山區交通日仍以約150g為目標，但不用硬塞一頓很重的宵夜：高鐵前後先吃45–55g，隨身帶35–45g蛋白（茶葉蛋、無糖豆漿、雞胸／瘦肉、方便時可帶優格），山賓熱午餐再補約30–45g；回高雄若仍餓，再用老江火腿蛋吐司或便利商店蛋白補足。阿里山茶與在地小吃照吃，便利商店只是補蛋白，不取代旅行體驗。',
            insiderTip: 'The 9:30 AM / 4:40 PM reserved 7329 pair is the better fit for your sleep preference: you give up only 50 minutes on the mountain versus the 8:40 bus, but avoid a 6:50 AM hotel departure. A 9:30 AM hotel departure would be too late for a worthwhile public-transport Alishan day.'
          },

          {
            id: 'day-10',
            dayNum: '10',
            shortLabel: 'Cijin / 旗津',
            city: 'Kaohsiung',
            dateString: 'Mon, Dec 07, 2026',
            timeZone: 'Asia/Taipei',
            title: 'Cijin Headland → Recovery Massage → Shrimp Fishing',
            titleTc: '旗津岬角・全身指壓・夜間釣蝦',
            hotelRef: 'kaohsiung',
            transitSummary: 'MRT + Ferry + Tactical Metered Taxi / 捷運・渡輪・計程車',
            weatherExpected: '~26°C • Pleasant southern-coast planning range',
            rainBackupAvailable: true,
            easyPlan: "If legs are tired after Alishan, shorten Cijin to lighthouse/headland + seafood only. The fixed 2:15 PM massage and evening shrimp fishing are the anchors.",
            leaveByTime: '9:25 AM from hotel',
            timeline: [
              {
                time: '9:25 AM – ~10:15 AM',
                title: 'Hotel ➔ Gushan Ferry ➔ Cijin',
                titleTc: '飯店 → 鼓山輪渡站 → 旗津',
                icon: 'ship',
                notes: 'Use MRT as the cheap default: Kaohsiung Main → Formosa Boulevard → Sizihwan, then walk to Gushan Ferry. Take a metered taxi only if late, raining hard or the group wants to protect the compressed morning.',
                navigateTo: 'Gushan Ferry Pier, Gushan District, Kaohsiung',
                addressTc: '高雄市鼓山區濱海二路1號',
                guide: {
                  intro: 'Low-cost harbor transfer with enough buffer to make the 2:15 PM massage comfortably.',
                  steps: [
                    { label: 'MRT First', detail: 'Leave Airline Inn around 9:25 AM. Walk to Kaohsiung Main, Red Line to Formosa Boulevard, transfer Orange Line to Sizihwan, then walk to Gushan Ferry.' },
                    { label: 'Taxi Trigger', detail: 'If the ETA slips materially, compare Uber / 55688 / LINE GO straight to Gushan Ferry. For 3 people, this is a reasonable tactical save, not the default.' },
                    { label: 'Ferry', detail: 'Tap EasyCard and take the short harbor ferry to Cijin. Head toward the northern headland immediately rather than browsing souvenir stalls first.' }
                  ]
                }
              },
              {
                time: '~10:15 AM – 11:45 AM',
                title: 'Cihou Fort, Lighthouse & Coastal Walk',
                titleTc: '旗後砲台・高雄燈塔・海岸步行',
                icon: 'footprints',
                notes: 'Compact on-foot version of Cijin. Prioritize the headland views, lighthouse/fort exterior and coastline; no vehicle rental needed and no need for a long island circuit.',
                navigateTo: 'Kaohsiung Lighthouse, Qijin District, Kaohsiung',
                addressTc: '高雄市旗津區旗下巷34號',
                guide: {
                  intro: 'Efficient active coastal loop covering the headland without spending half a day on the island.',
                  steps: [
                    { label: 'Headland Climb', detail: 'Walk from the ferry area toward the Cihou headland. Take the signed uphill path to the fort/lighthouse viewpoints.' },
                    { label: 'Fort', detail: 'Treat Cihou Fort as a quick architecture/viewpoint stop, not a history lesson. Spend roughly 15–20 minutes.' },
                    { label: 'Lighthouse', detail: 'Continue to the white Kaohsiung Lighthouse viewpoint for harbor-channel and container-port views.' },
                    { label: 'Coast', detail: 'Descend toward the northern beach/coastal promenade. Follow any construction/detour signs; the official bathing area is not the purpose of this visit.' },
                    { label: 'Hard Exit', detail: 'Turn back toward Miaoqian seafood street by ~11:45 AM. Do not extend farther south today; the 2:15 PM massage has priority.' }
                  ],
                  recheck: 'Recheck Cijin construction/access 48–72h beforehand.'
                }
              },
                            {
                time: '11:45 AM – 12:40 PM',
                title: 'Qihou Seafood — Cijin Lunch',
                titleTc: '旗后海產・旗津午餐',
                icon: 'utensils',
                notes: 'Higher-reviewed replacement for the previous seafood anchor, directly on Miaoqian Road near the ferry/headland route. Transparent pricing and strong independent review depth make it a better fit.',
                navigateTo: '高雄市旗津區廟前路31號',
                addressTc: '高雄市旗津區廟前路31號',
                guide: {
                  intro: 'Fast seafood lunch on the exact route back toward the ferry.',
                  steps: [
                    { label: 'Primary', detail: 'Eat at Qihou Seafood 旗后海產, 廟前路31號. Ask for the Chinese menu / clear price confirmation before ordering.' },
                    { label: 'Order for 3', detail: 'Choose one steamed fish, prawns or clams, one vegetable and rice as wanted. Keep the order moderate because the 2:15 PM massage follows.' },
                    { label: 'Queue Rule', detail: 'Recent independent reviews mention possible waits. If seating will exceed ~10–15 min, skip a formal seafood lunch and buy a fast 7-ELEVEN / FamilyMart protein meal near the ferry rather than jeopardizing the appointment.' },
                    { label: 'Exit', detail: 'Request the bill around 12:30 PM and walk immediately to the ferry.' }
                  ]
                }
              },
              {
                time: '~12:40 PM – 2:05 PM',
                title: 'Ferry Back + Metered Taxi to Xintian Massage',
                titleTc: '渡輪返回鼓山・計程車前往新田按摩',
                icon: 'navigation',
                notes: 'Ferry back to Gushan, then use a Uber / 55688 / LINE GO directly to 新田路145號. This is exactly where a cheap split-three-way taxi is worth it: it protects a fixed appointment and removes transfers.',
                navigateTo: '高雄市新興區新田路145號',
                addressTc: '高雄市新興區新田路145號',
                guide: {
                  intro: 'Protected cross-city transfer after the compressed Cijin morning.',
                  steps: [
                    { label: 'Ferry', detail: 'Target the first practical ferry back after lunch. Do not stop for extra shopping on the pier.' },
                    { label: 'Taxi', detail: 'From Gushan, use Uber / 55688 / LINE GO dispatch; if taking a street yellow taxi, confirm the meter starts. Show: 「高雄市新興區新田路145號」.' },
                    { label: 'Arrival Target', detail: 'Aim to reach the Xintian/Central Park area by ~1:30–1:40 PM, leaving a generous buffer before the 2:15 PM appointment.' },
                    { label: 'Buffer Use', detail: 'Use spare time for restroom, water, a short Central Park walk or a small protein top-up. Check in for massage around 2:00–2:05 PM.' }
                  ]
                }
              },
              {
                time: '2:15 PM – 3:55 PM',
                title: 'Left Foot / Right Foot: 100-min Full-Body Acupressure',
                titleTc: '左腳右腳經典按摩會館（新田時尚會館）',
                icon: 'sparkles',
                notes: '100-min Taiwanese full-body acupressure (指壓, NT$1,700/person). Fixed advance booking for 3 men; ideal recovery after Alishan + Cijin walking.',
                navigateTo: '高雄市新興區新田路145號',
                addressTc: '高雄市新興區新田路145號',
                guide: {
                  intro: 'Taiwanese full-body acupressure session placed after the trip’s most active southern-Taiwan stretch.',
                  steps: [
                    { label: 'Arrival Buffer', detail: 'Arrive by 2:00–2:05 PM (~10–15 min before appointment).' },
                    { label: 'Booking Request Script', detail: 'Use: 「我們三位男生想同一個時間做100分鐘全身指壓，力道中等偏強，肩頸、小腿可以多加強一點。請問可以安排三位同時開始嗎？也麻煩安排三位經驗比較穩定、力道較好的師傅，謝謝。」' },
                    { label: 'Treatment Flow', detail: 'Change into clean cotton garments. 100-minute session covers back, neck, shoulders and lower legs; tell the therapist where Alishan/Cijin walking created soreness.' },
                    { label: 'Calibration', detail: 'Useful phrases: 「這裡痠痛，可以多按一下」 / 「力道剛剛好」 / 「這裡輕一點」.' },
                    { label: 'Finish', detail: 'Tea/light refreshment if offered. Depart around 4:05–4:10 PM.' }
                  ],
                  exit: 'Depart by 4:05–4:10 PM. Keep the rest of the evening easy until shrimp fishing.',
                  recheck: 'Direct booking preferred to guarantee 3 simultaneous therapists.'
                }
              },
              {
                time: '4:10 PM – 5:10 PM',
                title: 'Central Park / Hotel Reset',
                titleTc: '中央公園／飯店休息',
                icon: 'heart-pulse',
                notes: 'Deliberate one-hour recovery buffer after the 100-minute massage. Stay around Central Park if energy is good or take a quick taxi to the hotel for a shower/reset. Dinner is explicitly scheduled next at Shantou Chuan Cheng.',
                noMap: true,
                guide: {
                  intro: 'Recover first so dinner and shrimp fishing stay fun rather than becoming a forced march.',
                  steps: [
                    { label: 'Stay Out', detail: 'If everyone feels good, stroll Central Park/Shinkuchan, hydrate and keep the pace easy.' },
                    { label: 'Hotel Reset', detail: 'If legs are cooked after Alishan/Cijin, taxi to Airline Inn for a quick shower/reset and leave again around ~5:00 PM.' }
                  ]
                }
              },
              {
                time: '5:25 PM – 6:55 PM',
                title: 'Shantou Chuan Cheng Hotpot — Early Dinner',
                titleTc: '汕頭泉成沙茶火鍋・中山總店',
                icon: 'utensils',
                notes: 'Primary post-massage dinner at 中山橫路7號. A 15-minute post-reset transfer buffer is now explicit; the current listing runs very late, so the early slot is comfortably inside service hours. Call 1–3 days ahead only if they confirm there is no deposit, prepayment or card guarantee.',
                navigateTo: '高雄市新興區中山橫路7號',
                addressTc: '高雄市新興區中山橫路7號',
                guide: {
                  intro: 'Specific, substantial Kaohsiung dinner placed between massage and shrimp fishing without a cross-city detour.',
                  steps: [
                    { label: 'Reservation Rule', detail: 'Optional: call 1–3 days ahead for 3 people only if the reservation is free and requires no deposit/prepayment/card guarantee. Otherwise simply use walk-in + backup logic.' },
                    { label: 'Order', detail: 'Build the meal around beef/pork/chicken/seafood, vegetables and tofu. Keep starch moderate because shrimp fishing follows.' },
                    { label: 'Queue Rule', detail: 'If the wait is >~10–15 minutes, switch to a nearby Old Sichuan (老四川) branch, which has late hours and works as a real same-area backup.' },
                    { label: 'Exit', detail: 'Aim to finish/pay by ~6:55 PM and leave by ~7:00 PM for the confirmed shrimp-fishing venue.' }
                  ]
                }
              },
                            {
                time: '7:45 PM – 10:00 PM',
                title: 'New Da He Le — Taiwanese Shrimp Fishing & Grill',
                titleTc: '新大和樂休閒館・釣蝦與現烤泰國蝦',
                icon: 'sparkles',
                notes: 'The shrimp-fishing venue is now explicit rather than “confirmed later.” New Da He Le is a high-volume, strongly reviewed 24-hour shrimp-fishing complex in Fengshan. Reconfirm pond/package details shortly before travel.',
                navigateTo: '高雄市鳳山區建國路三段455號',
                addressTc: '高雄市鳳山區建國路三段455號',
                guide: {
                  intro: 'Interactive Taiwanese night leisure with a concrete venue and no last-minute venue hunt.',
                  steps: [
                    { label: 'Transit', detail: 'After Shantou Chuan Cheng dinner, use an app-dispatched/metered taxi directly to 新大和樂休閒館, 建國路三段455號. Split 3 ways; this is worth avoiding awkward late-evening transfers.' },
                    { label: 'Beginner Package', detail: 'Ask staff for the current beginner rod/pond pricing for 3 and target ~1.5–2 hours rather than an all-night session.' },
                    { label: 'Setup', detail: 'Have staff show bait, depth and hook-set technique before starting.' },
                    { label: 'Cook & Eat', detail: 'If the on-site grill/kitchen is operating as expected, salt-grill the prawns you actually catch and eat them fresh.' },
                    { label: 'Exit', detail: 'Return gear around 9:45–10:00 PM, wash hands thoroughly, taxi back to Airline Inn and finish packing.' }
                  ],
                  recheck: '48–72h before: reconfirm 24h operation, beginner pricing, grilling setup and whether 3 people need any reservation.'
                }
              }
            ],
            rainPlan: 'Heavy rain or a deliberately shortened Cijin morning: use Taroko Sports at SKM Park as the primary indoor swap. Monday hours start at 11:00 AM; target roughly 11:00 AM–12:15 PM for a small walk-in batting-cage session, then take the Red Line from Caoya toward Central Park so the fixed 2:15 PM massage remains comfortably protected. If everyone is exhausted after Alishan, skip the cages too and simply rest.',
            backups: {
              activity: {
                title: 'Taroko Sports SKM Park — Batting Cages',
                titleTc: '大魯閣棒壘球打擊場・高雄草衙道',
                note: 'Primary rain / shortened-Cijin backup. Monday opens at 11:00 AM; target ~11:00–12:15 for a small walk-in session. Multiple baseball lanes run roughly 80–120 km/h plus pitching machines. It is by Caoya MRT Exit 2; leave by ~12:15 and ride the Red Line toward Central Park so the 2:15 PM massage stays safe. Buy only a small play amount — no membership/package.',
                navigateTo: 'Taroko Sports SKM Park, Kaohsiung'
              },
              services: [
                {
                  title: '腳酸小狗按摩會館 (Sore Dog Foot Massage)',
                  titleTc: '腳酸小狗按摩會館',
                  note: 'Same-day bodywork backup only if the primary Left Foot / Right Foot booking fails.',
                  navigateTo: '高雄市三民區博愛一路137號'
                },
                {
                  title: '悅世界足體養生館 (Yue Shi Jie Spa)',
                  titleTc: '悅世界足體養生館',
                  note: 'Second station-area bodywork backup if the primary booking fails.',
                  navigateTo: '高雄市三民區博愛一路121號'
                }
              ],
              foods: [
                {
                  title: 'Old Sichuan Zhongshan',
                  titleTc: '老四川巴蜀麻辣燙 中山店',
                  note: 'Named late-hours dinner fallback explicitly referenced in the Shantou Chuan Cheng timeline if the primary wait exceeds ~10–15 min.',
                  navigateTo: '高雄市新興區中山一路',
                  addressTc: '高雄市新興區中山一路'
                }
              ]
            },
            foodRecommendation: '旗后海產 → 汕頭泉成沙茶潮鍋（backup: 老四川中山店）→ 新大和樂現烤蝦',
            proteinPlan: 'Target ~150 g is easy today: make the Cijin lunch ~45–60 g from fish/prawns/clams/oysters, dinner another ~40–50 g from duck/chicken/beef/seafood, and count the prawns actually eaten at shrimp fishing. Use soy milk/eggs/chicken only if the total is still short. · 今日約150g很好達成：旗津午餐用魚、蝦、蛤蜊／蚵仔抓45–60g，晚餐鴨／雞／牛／海鮮再40–50g，釣蝦現烤吃掉的蝦也算。若仍不足，再用豆漿／蛋／雞胸補。',
            insiderTip: 'Do not add a Monday gym. If Cijin weather is poor, the batting cages are the useful indoor swap; otherwise keep Cijin. In either case, the fixed 2:15 PM massage stays protected.'
          },

          {
            id: 'day-11',
            dayNum: '11',
            shortLabel: 'HK / 抵港',
            city: 'Hong Kong / 香港',
            dateString: 'Tue, Dec 08, 2026',
            timeZone: 'Asia/Taipei',
            title: 'THSR to TPE → Flight CX400 → Jordan Night Wander',
            titleTc: '高鐵往桃園・CX400赴港・佐敦夜遊',
            hotelRef: 'hk',
            transitSummary: 'THSR -> Airport MRT -> CX400 (3:50 PM)',
            weatherExpected: '~20°C • Cool evening conditions',
            leaveByTime: '9:30 AM from hotel',
            timeline: [
              {
                time: '9:30 AM – 10:20 AM',
                title: 'Depart Hotel ➔ THSR Zuoying Station',
                titleTc: '飯店 → 高鐵左營站',
                icon: 'train',
                notes: 'Check out at 9:30 AM and use the best practical route to THSR Zuoying based on confirmed hotel location.',
                navigateTo: 'THSR Zuoying Station, Kaohsiung',
                guide: {
                  intro: 'Checkout and transfer to High Speed Rail terminus with comfortable buffer.',
                  steps: [
                    { label: 'Checkout', detail: 'Complete checkout by 9:30 AM. Ensure passports and flight confirmation are in daypacks.' },
                    { label: 'Zuoying Arrival', detail: 'Arrive at THSR Zuoying concourse by 10:15–10:20 AM (~30 min before departure).' }
                  ]
                }
              },
              {
                time: '~10:45 AM – 12:25 PM',
                title: 'THSR Train: Zuoying ➔ THSR Taoyuan Station',
                titleTc: '台灣高鐵：左營站 → 桃園站',
                icon: 'train',
                notes: 'Direct bullet train (~10:45–10:55 target departure) bypasses Taipei Main Station, saving 1+ hours of transit.',
                navigateTo: 'THSR Zuoying Station, Kaohsiung',
                guide: {
                  intro: 'Direct bullet train bypass to Taoyuan Airport transfer hub.',
                  steps: [
                    { label: 'Boarding', detail: 'Board reserved car for the ~10:45 AM train.' },
                    { label: 'The Bypass Hack', detail: 'Alight at THSR Taoyuan Station (桃園高鐵站). Do NOT ride all the way to Taipei Main Station; getting off at Taoyuan saves over an hour of backtracking.' }
                  ]
                }
              },
              {
                time: '12:40 PM – 1:00 PM',
                title: 'Taoyuan Airport MRT: THSR ➔ TPE Terminal 1',
                titleTc: '桃園機場捷運：高鐵桃園站 A18 → 第一航廈 A12',
                icon: 'train',
                notes: '~15-minute commuter shuttle directly into airport departure terminal. Recheck Taoyuan Airport MRT timetable ~3 days before travel.',
                navigateTo: 'THSR Taoyuan Station (Metro Transfer), Zhongli District',
                guide: {
                  intro: 'Metro transfer from bullet train to airport terminal.',
                  steps: [
                    { label: 'Transfer Path', detail: 'Follow overhead signs from HSR concourse down to Airport MRT Station A18 (Taoyuan HSR).' },
                    { label: 'Boarding', detail: 'Tap EasyCard and board commuter train bound for Taipei. Ride ~15 minutes directly to Terminal 1 (Station A12).' }
                  ]
                }
              },
                            {
                time: '1:05 PM – 3:15 PM',
                title: 'CX400 Check-in + Airside Lunch + Gate Buffer',
                titleTc: 'CX400 報到・管制區午餐・登機門緩衝',
                icon: 'plane',
                notes: 'After bag drop/security, use hómee KITCHEN in T1 airside (A4/B5-side locations depending gate path) for a named, well-reviewed airport meal. Choose the branch on your actual gate route; do not cross the terminal just for food.',
                noMap: true,
                guide: {
                  intro: 'Airport lunch is specific but subordinate to the flight gate.',
                  steps: [
                    { label: 'Bag Drop', detail: 'Proceed to Cathay Pacific counters in T1 departures and check all bags to HKG.' },
                    { label: 'Security & Exit', detail: 'Clear security and exit immigration with a large buffer.' },
                    { label: 'Lunch', detail: 'If one of the hómee KITCHEN 好饗廚房 T1 airside locations is naturally on the route to your assigned gate, eat there; choose beef/pork/chicken/rice/noodle options as desired.' },
                    { label: 'No-Detour Rule', detail: 'If your gate is far from hómee or seating is >10–15 min, use the nearest named/posted airside concession instead. The gate always wins.' },
                    { label: 'Boarding Buffer', detail: 'Check the boarding pass for actual boarding time and be in the gate area comfortably early.' }
                  ]
                }
              },
              {
                time: '3:50 PM – 6:00 PM',
                startAt: '2026-12-08T15:50:00+08:00',
                endAt: '2026-12-08T18:00:00+08:00',
                title: 'Cathay Pacific CX400: Taipei → Hong Kong',
                titleTc: '國泰航空 CX400：台北桃園 → 香港',
                icon: 'plane',
                notes: 'User-confirmed 3:50 PM departure. Boarding pass and live gate information remain final; the schedule intentionally keeps the airport meal subordinate to a calm gate arrival.',
                noMap: true,
                guide: {
                  intro: 'Short regional flight with a protected boarding buffer.',
                  steps: [
                    { label: 'At the Gate', detail: 'Be in the assigned gate area before boarding begins; do not leave for a distant concession after 3:15 PM.' },
                    { label: 'Documents', detail: 'Keep passports, Hong Kong hotel address and Digital Tourist Octopus setup accessible in the shared travel note.' },
                    { label: 'Arrival Prep', detail: 'Before landing, switch the active data line as needed and confirm the quickest route from baggage claim to Airport Express.' }
                  ]
                }
              },
              {
                time: '6:00 PM',
                title: 'Touchdown Hong Kong (HKG Terminal 1)',
                titleTc: '香港國際機場',
                icon: 'plane-landing',
                notes: 'Proceed to visitor immigration with passports, collect luggage, then follow Airport Express signs. Digital Octopus in Apple Wallet is active.',
                noMap: true,
                guide: {
                  intro: 'Hong Kong arrival, luggage claim, and seamless Airport Express transit.',
                  steps: [
                    { label: 'Immigration', detail: 'Proceed to visitor immigration with passports. Visitors do not need to complete or furnish paper arrival slips.' },
                    { label: 'Baggage Claim', detail: 'Collect suitcases from carousel.' },
                    { label: 'Octopus Check', detail: 'Confirm Digital Tourist Octopus card in Apple Wallet or physical card has at least HK$200 loaded.' }
                  ]
                }
              },
              {
                time: '~6:45 PM – 7:30 PM',
                title: 'Airport Express to Kowloon Station',
                titleTc: '機場快綫：機場站 → 九龍站',
                icon: 'train',
                notes: 'Take the next practical Airport Express after immigration and checked bags (~22-min ride directly to Kowloon Station).',
                navigateTo: 'Hong Kong International Airport Ground Transportation Centre',
                guide: {
                  intro: 'High-speed 22-minute rail connection into Kowloon.',
                  steps: [
                    { label: 'Boarding', detail: 'Walk directly onto Airport Express train in arrival hall (no turnstiles at airport entrance; you tap out at destination).' },
                    { label: 'Ride', detail: 'Sit back for smooth 22-minute ride across Tsing Ma Bridge.' },
                    { label: 'Alight', detail: 'Alight at Kowloon Station (九龍站). Tap Octopus at exit turnstiles.' }
                  ]
                }
              },
              {
                time: '~7:30 PM – 8:15 PM',
                title: 'Red Metered Taxi to Sasa Inn & Hotel Check-in',
                titleTc: '新月賓館（Sasa Inn）入住',
                icon: 'building-2',
                notes: 'Use the official red metered-taxi stand for the short ~5-minute ride from Kowloon Station to 87 Nathan Road (TST Exit C2). For this hop, street/stand taxi is the cheap-convenient default; no private-car premium needed.',
                navigateTo: '香港九龍尖沙咀彌敦道87號華源大廈C座8字樓C1室',
                addressTc: '香港九龍尖沙咀彌敦道87號華源大廈C座8字樓C1室',
                guide: {
                  intro: 'Short metered-taxi transfer avoiding baggage dragging through MTR pedestrian tunnels.',
                  steps: [
                    { label: 'Taxi Stand', detail: 'Follow signs to Kowloon Station Red Urban Taxi Stand. Take one red metered taxi for all 3 travelers and luggage. If the stand is unusually backed up, compare DiDi Taxi or Uber Meter Taxi—not premium Uber categories.' },
                    { label: 'Show Driver', detail: 'Show Chinese destination: 「尖沙咀彌敦道87號 華源大廈」 (~HK$40–50 fare + HK$6 per luggage piece).' },
                    { label: 'Check-In', detail: 'Check into Sasa Inn (新月賓館, Deluxe Triple Room, Block C, 8F Room C1). Drop suitcases in room and refresh.' }
                  ]
                }
              },
                            {
                time: '8:30 PM – 9:45 PM',
                title: 'Mak Man Kee Wonton Noodles — Jordan Arrival Supper',
                titleTc: '麥文記麵家・佐敦抵港宵夜',
                icon: 'utensils',
                notes: 'Specific late-night arrival anchor on Parkes Street with thousands of independent reviews and hours that tolerate a delayed airport arrival. Skip entirely if the group is exhausted.',
                navigateTo: '香港佐敦白加士街51號',
                addressTc: '香港佐敦白加士街51號',
                guide: {
                  intro: 'One robust supper target; no multi-stop arrival-night food crawl.',
                  steps: [
                    { label: 'Walk', detail: 'From Sasa Inn, walk north on Nathan Road and turn onto Parkes Street.' },
                    { label: 'Supper', detail: 'At Mak Man Kee 麥文記麵家, 白加士街51號, order wonton noodles plus a second protein dish if hungry.' },
                    { label: 'Queue Rule', detail: 'If the wait is >10–15 min or energy is low, skip supper and return to the hotel. Arrival-night sleep has higher value.' },
                    { label: 'Continue', detail: 'Finish around 9:40–9:45 PM and continue through Jordan toward Temple Street for one compact night walk.' }
                  ]
                }
              },
              {
                time: '9:45 PM – 10:25 PM',
                title: 'Temple Street + Jordan Night Walk',
                titleTc: '廟街＋佐敦夜間散步',
                icon: 'footprints',
                notes: 'A short first-night Hong Kong walk after supper: neon, market frontage and neighborhood streets without turning it into another eating mission.',
                navigateTo: 'Temple Street Night Market, Jordan, Hong Kong',
                addressTc: '香港佐敦廟街',
                guide: {
                  steps: [
                    { label: 'Route', detail: 'Walk from Parkes Street toward Temple Street and enter around the Jordan section.' },
                    { label: 'Browse', detail: 'Spend ~30 minutes on the stalls, signs and side streets. Browse only; no need to buy or eat anything unless something truly stands out.' },
                    { label: 'Hotel', detail: 'Walk south back to Sasa Inn and aim to be in the room around 10:30 PM.' }
                  ]
                }
              }
            ],
            backups: {},
            foodRecommendation: 'hómee KITCHEN T1 airside → Mak Man Kee 麥文記麵家 if energy allows',
            proteinPlan: 'Target ~150 g: transit day—choose a meat/egg-heavy airport lunch, then in Jordan pair wonton noodles with roast meat, fish balls, beef brisket or another protein dish. Egg waffles are dessert; top up with milk/soy milk, yogurt or eggs if needed. · 目標約150g：移動日機場午餐優先肉／蛋；佐敦宵夜把雲吞麵搭配燒味、魚蛋、牛腩或另一份蛋白質主菜。雞蛋仔當甜點；不足再用牛奶／豆漿、優格或蛋補。',
            insiderTip: 'From Kowloon Station to Sasa Inn, use the red metered-taxi stand. For 3 adults with luggage the split fare is small and avoids dragging bags; DiDi Taxi / Uber Meter Taxi are dispatch backups, not the default premium ride.'
          },

          {
            id: 'day-12',
            dayNum: '12',
            shortLabel: 'Peak / 山頂',
            city: 'Hong Kong / 香港',
            dateString: 'Wed, Dec 09, 2026',
            timeZone: 'Asia/Hong_Kong',
            title: 'Central Urban Walk → Victoria Peak → Happy Valley Races',
            titleTc: '中上環城市步行・太平山・跑馬地夜馬',
            hotelRef: 'hk',
            transitSummary: 'Star Ferry -> Peak Tram -> Tram',
            weatherExpected: '~19°C • Mild; cool evening breeze',
            rainBackupAvailable: true,
            easyPlan: "If tired, shorten the Central/Sheung Wan walking loop. Preserve Peak sunset and Happy Valley races.",
            leaveByTime: '9:30 AM from hotel',
            timeline: [
              {
                time: '9:30 AM – 10:10 AM',
                title: 'Depart Hotel & Star Ferry Crossing (TST ➔ Central)',
                titleTc: '尖沙咀天星碼頭',
                icon: 'ship',
                notes: 'Walk to pier and ride historic ferry upper deck (HK$5) for morning harbor views.',
                navigateTo: 'Tsim Sha Tsui Star Ferry Pier, Kowloon',
                addressTc: '尖沙咀天星碼頭',
                guide: {
                  intro: 'Historic harbor crossing between Kowloon and Hong Kong Island.',
                  steps: [
                    { label: 'Walk to Pier', detail: 'Walk 12 minutes south down Nathan Rd and Canton Rd to Tsim Sha Tsui Star Ferry Pier.' },
                    { label: 'Turnstile', detail: 'Tap Octopus at Upper Deck turnstile (HK$5).' },
                    { label: 'Seating', detail: 'Board classic green-and-white wooden ferry. Pick open forward-facing bench with view of Central skyscrapers.' }
                  ]
                }
              },
              {
                time: '10:10 AM – 12:15 PM',
                title: 'Sheung Wan ➔ Central High-Mileage Urban Walk',
                titleTc: '上環 → 中環高密度街區步行',
                icon: 'footprints',
                notes: 'Replaces the forced mahjong workshop. Walk a dense local route: dried-seafood streets, market lanes, Cat Street if interesting, Central Market and Mid-Levels escalator. Free, flexible and easy to shorten or extend. / 不為了手作而手作。',
                navigateTo: 'Sheung Wan, Hong Kong',
                addressTc: '香港上環／中環',
                guide: {
                  intro: 'Two-hour urban exploration using your high walking tolerance instead of a low-energy scheduled craft workshop.',
                  steps: [
                    { label: 'Start West', detail: 'From Central Ferry Pier, walk or tram/MTR one stop toward Sheung Wan and begin around the dried-seafood / medicine streets.' },
                    { label: 'Working Streets', detail: 'Walk Des Voeux Road West / Wing Lok / Bonham Strand lanes, then cut through older side streets. Because you speak Chinese, browse naturally and ask shopkeepers questions when appropriate.' },
                    { label: 'Optional Cat Street', detail: 'Pass Upper Lascar Row only if the stalls look interesting; do not force a souvenir stop.' },
                    { label: 'Market + Escalator', detail: 'Continue through Central Market/Graham Street market area and ride/walk part of the Mid-Levels escalator system.' },
                    { label: 'Mileage Target', detail: 'Expect several kilometers of walking with constant food/shop/photo micro-stops. No reservation and no sunk-cost problem if one area is boring.' }
                  ],
                  exit: 'Reach the Central/Tai Kwun lunch zone around 12:15 PM.'
                }
              },
                            {
                time: '12:15 PM – 2:20 PM',
                title: 'Tsim Chai Kee (backup: One Dim Sum Central) + Tai Kwun',
                titleTc: '沾仔記（備案：一點心中環）＋大館快逛',
                icon: 'utensils',
                notes: 'Route-efficient Wellington Street lunch. If the wait is >10–15 min, use the explicitly named One Dim Sum Central on Lyndhurst Terrace rather than wandering for a replacement.',
                navigateTo: '香港中環威靈頓街98號地下B舖',
                addressTc: '香港中環威靈頓街98號地下B舖',
                guide: {
                  intro: 'Specific lunch + named same-district fallback before the Peak.',
                  steps: [
                    { label: 'Primary', detail: 'Eat at Tsim Chai Kee 沾仔記, 98 Wellington Street. Mix wonton, beef and/or fish-ball toppings across 3 bowls.' },
                    { label: 'Backup', detail: 'If Tsim Chai Kee is >10–15 min, use One Dim Sum Central 一點心中環, G/F 44 Lyndhurst Terrace. It is compact/fast and lies in the same Central walking zone.' },
                    { label: 'Tai Kwun', detail: 'After lunch, spend ~20–30 min in the Tai Kwun courtyard/architecture only if it is naturally on your line toward the Peak.' },
                    { label: 'Hard Exit', detail: 'Protect the 2:45 PM Peak block; do not let lunch expand into a long Central crawl.' }
                  ]
                }
              },
              {
                time: '2:45 PM – 5:55 PM',
                title: 'Peak Tram Ascent & Lugard Road Sunset',
                titleTc: '山頂纜車花園道總站',
                icon: 'train',
                notes: 'Take Peak Tram up if queue <= ~15–20 min. If longer, Bus 15 is the cheap/convenient fallback; use a red taxi only if the bus wait/traffic situation makes it clearly better. Walk flat paved Lugard Road cliffside loop for 5:39 PM winter sunset over Victoria Harbour.',
                navigateTo: '中環花園道33號',
                addressTc: '中環花園道33號',
                guide: {
                  intro: 'Ascending Victoria Peak and walking the cliffside Lugard Road panorama.',
                  steps: [
                    { label: 'Queue Rule', detail: 'Check queue at Garden Road Lower Terminus. If under 20 minutes, tap Octopus for the historic funicular (sit on RIGHT side for city views). If longer, use Bus 15 from Exchange Square first; red taxi only if the bus option is materially slower.' },
                    { label: 'Skip Mall', detail: 'Upon reaching Peak Tower, do NOT pay for Sky Terrace 428. Walk directly past shops to start of Lugard Road (盧吉道).' },
                    { label: 'Lugard Road Walk', detail: 'Walk 15–20 minutes along this flat, shaded cliffside trail.' },
                    { label: 'Viewpoint', detail: 'Arrive at famous open railing viewpoint suspended over cliffs. Sunset is 5:39 PM. Watch daylight transition into twilight as skyscraper neon fires up across harbor.' }
                  ]
                }
              },
              {
                time: '5:55 PM – 6:50 PM',
                title: 'Peak ➔ Happy Valley — Hard Transfer Window',
                titleTc: '太平山 → 跑馬地・硬性轉場',
                icon: 'navigation',
                notes: 'Leave the Peak immediately after twilight. With 3 people, compare the live red-taxi ETA against Peak Tram / Bus 15 + onward transit; take the taxi whenever it meaningfully saves time. Target Happy Valley around 6:50–7:00 PM rather than treating the descent as invisible.',
                navigateTo: 'Happy Valley Racecourse, Hong Kong',
                addressTc: '香港跑馬地黃泥涌道',
                guide: {
                  intro: 'A protected transfer block so sunset and the race night cannot collide.',
                  steps: [
                    { label: 'Hard Exit', detail: 'At ~5:55 PM, stop sightseeing and start descending immediately. Do not add Peak Tower shopping / dinner.' },
                    { label: 'Compare Live ETAs', detail: 'Check red taxi versus Peak Tram / Bus 15. With 3 people, use a taxi when the live ETA materially beats public transport; otherwise take the first sensible transit option.' },
                    { label: 'Arrival Target', detail: 'Aim to be at the Happy Valley visitor entrance around 6:50–7:00 PM. Use the buffer for passport entry / programme pickup rather than arriving after the evening is underway.' }
                  ],
                  exit: 'Treat 5:55 PM as the Peak hard exit.'
                }
              },
              {
                time: '~6:50/7:00 PM – 9:45 PM',
                title: 'Happy Valley Races: International Jockeys’ Championship',
                titleTc: '跑馬地馬場',
                icon: 'sparkles',
                notes: 'Opening night of International Races Week. Present physical overseas passport at tourist desk for free entry. Soak in electric atmosphere and floodlit turf races.',
                navigateTo: '香港跑馬地黃泥涌道',
                addressTc: '香港跑馬地黃泥涌道',
                guide: {
                  intro: 'Floodlit horse racing at Hong Kong’s historic urban track.',
                  steps: [
                    { label: 'Passports & Dress', detail: 'Bring physical overseas passports (visitors must be 18+). Do not wear flip-flops or plastic slippers.' },
                    { label: 'Visitor Privilege', detail: 'Head to the Visitor Service Counter at the Public Enclosure entrance on Wong Nai Chung Road. Present passports for complimentary tourist admission.' },
                    { label: 'Race Programme', detail: 'Pick up an official race programme and orient to trackside areas, public enclosure rails, and beer garden.' },
                    { label: 'Paddock Viewing', detail: 'Walk by the parade ring / paddock area to observe horses and jockeys before a race.' },
                    { label: 'Trackside Rail', detail: 'Head directly to the turf rail during at least one race to feel thoroughbred hoofbeats under floodlights.' },
                    { label: 'Optional Wager', detail: 'Placing a bet is purely optional entertainment; ask official staff if you want help reading bet slips.' },
                    { label: 'Evening Atmosphere', detail: 'Stay for several live races through ~9:40–9:45 PM. Leave before the very end if needed so the late dinner does not become a midnight scramble.' }
                  ]
                }
              },
              {
                time: '10:20 PM – 11:15 PM',
                title: 'Yung’s Tangerine Peel Roast Goose — Late TST Dinner',
                titleTc: '榕哥陳皮燒鵝・尖沙咀宵夜',
                icon: 'utensils',
                notes: 'Named late dinner on the way back to Sasa Inn after Happy Valley. Current TST hours run to midnight, so this fixes the race-night dinner gap without adding a cross-city detour.',
                navigateTo: '香港尖沙咀金馬倫道48號中國保險大廈地下B號舖',
                addressTc: '香港尖沙咀金馬倫道48號中國保險大廈地下B號舖',
                guide: {
                  intro: 'A route-safe Cantonese roast-meat dinner after the races instead of relying on vague stadium snacks.',
                  steps: [
                    { label: 'Leave Races', detail: 'Around 9:40–9:45 PM, head back toward Tsim Sha Tsui using the simplest live MTR/tram + MTR route or a red taxi if it materially saves time.' },
                    { label: 'Primary', detail: 'Eat at Yung’s Tangerine Peel Roast Goose 榕哥陳皮燒鵝, 48 Cameron Road. Order roast goose plus char siu/another roast meat and a vegetable or rice/noodle side for 3.' },
                    { label: 'Queue Rule', detail: 'If the wait is >10–15 minutes, use takeaway if immediate; otherwise skip it and use a nearby 7-ELEVEN by Sasa Inn for eggs/milk/soy milk/ready protein. Do not start hunting for another famous restaurant at 10:30 PM.' },
                    { label: 'Return', detail: 'Finish by ~11:15 PM and walk back to Sasa Inn. This is a late night; no extra dessert stop is planned.' }
                  ]
                }
              }
            ],
            rainPlan: 'If Peak visibility/weather is poor, skip Peak and extend covered Central Market / Tai Kwun / Causeway Bay time before Happy Valley.',
            backups: {
              foods: [
                {
                  title: 'One Dim Sum Central',
                  titleTc: '一點心 中環',
                  note: 'Named same-district fallback explicitly referenced in the Tsim Chai Kee timeline when the primary wait exceeds ~10–15 min.',
                  navigateTo: 'G/F, 44 Lyndhurst Terrace, Central, Hong Kong',
                  addressTc: '香港中環擺花街44號地下'
                }
              ]
            },
            foodRecommendation: 'Tsim Chai Kee 沾仔記 → One Dim Sum Central 一點心中環 only if needed → Yung’s Tangerine Peel Roast Goose 榕哥陳皮燒鵝',
            proteinPlan: "Target ~150 g: make the Tsim Chai Kee bowl protein-forward with wonton + beef and/or fish balls, then use Yung’s roast goose/char siu as the real post-race dinner. Carry only a small emergency protein top-up if useful; the plan no longer depends on random race-night snacks. · 目標約150g：沾仔記午餐用雲吞＋牛肉／魚蛋加強蛋白；賽馬後以榕哥陳皮燒鵝／叉燒作正式晚餐。只需視需要帶少量備用蛋白，不再依賴隨機賽場零食。",
            insiderTip: 'Sunset is 5:39 PM; 5:55 PM is the hard Peak exit. Use a red taxi down whenever its live ETA meaningfully beats transit so Happy Valley starts around 6:50–7:00 PM, not after an invisible one-hour transfer.'
          },

          {
            id: 'day-13',
            dayNum: '13',
            shortLabel: 'Kowloon / 九龍',
            city: 'Hong Kong / 香港',
            dateString: 'Thu, Dec 10, 2026',
            timeZone: 'Asia/Hong_Kong',
            title: 'LOST Mong Kok → Sham Shui Po → Oi Man Sang → WestK Night Walk',
            titleTc: '旺角密室逃脫・深水埗・愛文生・西九海濱夜走',
            hotelRef: 'hk',
            transitSummary: 'WestK / TST → Mong Kok → Sham Shui Po → WestK',
            weatherExpected: '~20°C • Mild seasonal conditions',
            rainBackupAvailable: true,
            easyPlan: "If the gym is not free/cheap, skip it. If LOST cannot confirm Mandarin/English support for the selected room, skip the escape room. Preserve the Sham Shui Po street hunt, Oi Man Sang dinner and at least a short WestK waterfront walk.",
            leaveByTime: '9:30 AM for gym',
            timeline: [
              {
                time: '9:30 AM – 11:25 AM',
                title: 'Routine Gym — Private 60-min Pod',
                titleTc: 'The Gym Pod @ 戲曲中心',
                icon: 'dumbbell',
                notes: 'Optional maintenance lift only if HKFIT100 / the live checkout makes the 60-minute 3-person pod free or genuinely cheap. Otherwise skip it — routine lifting has less travel value than the rest of this day.',
                navigateTo: '88 Austin Road West, West Kowloon, Hong Kong',
                addressTc: '香港九龍西九文化區柯士甸道西88號 戲曲中心',
                guide: {
                  steps: [
                    { label: 'Booking & Arrival', detail: 'Book TWO consecutive 30-minute sessions in The Gym Pod app. Select/declare 3 pax correctly. Check the live booking window around a week ahead. Leave Sasa around 9:30 AM; walk if routing is clean, otherwise split a short red metered taxi.' },
                    { label: 'Price & Access', detail: 'The official Xiqu page currently directs users to live app pricing rather than publishing a fixed base rate. Promo code HKFIT100 currently advertises the first eligible hour free. VERIFY eligibility and the exact 3-person checkout total before confirming.' },
                    { label: 'Training', detail: 'Use the private Smith machine, cable station, dumbbells and adjustable bench. Rotate among stations efficiently for 60 minutes. Keep 2–3 reps in reserve and avoid unnecessary cardio/leg fatigue.' },
                    { label: 'Shower & Mong Kok', detail: 'Train roughly 9:45–10:45 AM. The Gym Pod Xiqu page does not advertise showers, so return briefly to Sasa for a quick shower/change, then head to Mong Kok. If the gym is skipped, simply leave the hotel later and keep the noon LOST target.' }
                  ]
                }
              },
              {
                time: '12:00 PM – 1:25 PM',
                title: 'LOST HK Mong Kok — 3-Person Escape Room',
                titleTc: 'LOST HK 旺角・三人密室逃脫',
                icon: 'key-round',
                notes: 'Weekday local price is currently HK$170/person — roughly half typical NYC private-room pricing. Book only after the branch confirms the selected room can be briefed/supported in Mandarin or English; avoid Cantonese-only wordplay. / 先確認普通話或英文支援，再付款。',
                navigateTo: '3/F, 67–71 Argyle Street, Mong Kok, Hong Kong',
                addressTc: '香港旺角亞皆老街67–71號3樓',
                guide: {
                  intro: 'Hands-on local leisure at a sensible weekday price, with language fit treated as a hard requirement.',
                  steps: [
                    { label: 'Language Check Before Booking', detail: 'Message the Mong Kok branch and name the exact room. Confirm the briefing and any clue assistance can be handled in Mandarin or English. Do not book a Cantonese-language wordplay-heavy room just because it is available.' },
                    { label: 'Arrival', detail: 'Target the Mong Kok branch around 11:50 AM, near MTR Exit D2. Allow time for briefing / lockers before the noon game.' },
                    { label: 'Room Choice', detail: 'Choose a room designed for roughly 2–5 / 3–5 players rather than a large-team room. Three people should stay actively involved throughout.' },
                    { label: 'Time Box', detail: 'Allow about 60 minutes of gameplay plus briefing/debrief, roughly 80–90 minutes total. Do not add a second escape room.' },
                    { label: 'Exit to Sham Shui Po', detail: 'Finish around 1:20–1:25 PM and take the MTR north one short hop to Sham Shui Po, targeting Exit C2 around ~1:45 PM.' }
                  ],
                  recheck: 'Before paying: confirm the exact room supports Mandarin or English briefing / clue assistance.'
                }
              },
              {
                time: '~1:45 PM – 4:35 PM',
                title: 'Sham Shui Po Working Commerce & Street Hunt',
                titleTc: '深水埗 街區探索',
                icon: 'camera',
                notes: 'Working neighborhood exploration: Apliu Street electronics, Ki Lung Street ribbons & notions, and Tung Chau Street Fabric Market. Optional group challenge: HK$100 each for the weirdest useful item.',
                navigateTo: '香港深水埗鴨寮街',
                addressTc: '香港深水埗鴨寮街',
                guide: {
                  intro: 'Street-by-street hunt through Kowloon’s authentic working-class trade district.',
                  steps: [
                    { label: 'Orient', detail: 'From LOST Mong Kok, ride one short MTR hop north and target Sham Shui Po Exit C2 around ~1:45 PM directly onto Apliu Street (鴨寮街).' },
                    { label: 'Apliu Street Electronics', detail: 'Explore phone accessories, audio cables, vintage film cameras, LEDs, and hand tools. Inspect used items carefully before paying; optional HK$100 weird-useful-item challenge.' },
                    { label: 'Ki Lung Street (Button Street)', detail: 'Turn onto Ki Lung Street (基隆街). Browse open bins of bone/ceramic buttons, buckles, and garment notions.' },
                    { label: 'Nam Cheong Street', detail: 'Walk along Nam Cheong Street to observe wholesale ribbons, lace, and sewing hardware shops.' },
                    { label: 'Tung Chau Fabric Market', detail: 'Walk past Sham Shui Po Fabric Market (269 Tung Chau Street, 50+ stalls preserving operators from former Pang Jai market) to see local tailors sourcing fabrics.' },
                    { label: 'Tofu Pudding Break', detail: 'Sit at Kung Wo Beancurd Factory (公和荳品廠) for silky warm tofu pudding (豆腐花) if queue is reasonable.' },
                    { label: 'Wrap Up', detail: 'Finish the street hunt by ~4:35 PM and walk directly toward Oi Man Sang for the 4:45 PM early dinner. No cross-Kowloon transfer is needed.' }
                  ]
                }
              },
                            {
                time: '4:45 PM – 6:20 PM',
                title: "Oi Man Sang (backup: Let's Yum Cha) — Sham Shui Po Dinner",
                titleTc: '愛文生（備案：飲茶點心）・深水埗晚餐',
                icon: 'utensils',
                notes: 'Keep dinner in Sham Shui Po instead of transferring to a lower-reviewed Jordan hawker market. Oi Man Sang gives the real dai-pai-dong/wok-hei experience; Let’s Yum Cha is the named high-confidence fallback if the queue is ugly.',
                navigateTo: '香港深水埗石硤尾街1A-1C號',
                addressTc: '香港深水埗石硤尾街1A-1C號',
                guide: {
                  intro: 'This is both a food and routing upgrade: authentic open-wok dinner without a cross-Kowloon detour.',
                  steps: [
                    { label: 'Pre-Dinner Snack', detail: 'During the earlier street hunt, stop at Kung Wo Beancurd Factory 公和荳品廠, 北河街118號, only if its queue is <=10 min. Share tofu pudding/soy item; do not fill up.' },
                    { label: 'Primary 4:45', detail: 'Get to Oi Man Sang 愛文生 around opening-adjacent time. Order 2–3 wok dishes for 3 such as black-pepper beef/potato, razor clams/prawns and vegetables.' },
                    { label: 'Hard Queue Rule', detail: 'Independent 2026 reviews praise the food but also report waits as long as 75 minutes. If the quoted wait is >15 min, LEAVE immediately.' },
                    { label: 'Backup', detail: "Use Let's Yum Cha 飲茶點心 nearby as the explicit backup. It has a stronger review score and broad hours; this is preferable to wasting an hour in a queue." },
                    { label: 'After Dinner', detail: 'Leave around 6:20 PM and move south toward West Kowloon Art Park. This is now a real evening block, not an early hotel return.' }
                  ]
                }
              },
              {
                time: '~6:55 PM – 9:30 PM',
                title: 'West Kowloon Art Park + Victoria Harbour Waterfront Night Walk',
                titleTc: '西九文化區藝術公園＋維港海濱夜走',
                icon: 'footprints',
                notes: 'This fixes the old 6:30 PM dead end. WestK Art Park is officially open until 11 PM and gives you lawns, footpaths and a long harbourfront without adding another paid attraction.',
                navigateTo: 'Art Park, West Kowloon Cultural District, Hong Kong',
                addressTc: '香港西九文化區藝術公園',
                guide: {
                  intro: 'Long, relaxed post-dinner walk with real open space and skyline views.',
                  steps: [
                    { label: 'Get There', detail: 'From Sham Shui Po, take the fastest live MTR/bus/taxi option south toward Austin/Kowloon Station and enter WestK around 6:55–7:10 PM.' },
                    { label: 'Art Park', detail: 'Walk the lawns/footpaths and the waterfront edge rather than going into another museum. Use the Competition Pavilion / harbourfront as one landmark, not a destination queue.' },
                    { label: 'Harbour Walk', detail: 'Continue east/southeast along the West Kowloon promenade at an easy pace with Victoria Harbour views. Stop for photos when the skyline/reflections are good.' },
                    { label: 'Flex', detail: 'If there is live street performance or a temporary outdoor installation that looks interesting, stop briefly; otherwise keep the walk unstructured.' },
                    { label: 'Hotel', detail: 'Start back around 9:20–9:30 PM and reach Sasa Inn around 9:45–10:00 PM.' }
                  ]
                }
              }
            ],
            rainPlan: 'LOST is indoors and works well in rain. In steady evening rain, skip the WestK lawn/waterfront and return to TST for a covered K11 MUSEA / Nathan Road walk; do not force an exposed harbour stroll.',
            backups: {
              activity: {
                title: 'K11 MUSEA / TST Covered Night Walk',
                titleTc: 'K11 MUSEA／尖沙咀有蓋夜走',
                note: 'Steady-rain fallback after dinner: use covered/indoor TST circulation rather than forcing the Art Park waterfront.',
                navigateTo: 'K11 MUSEA, Tsim Sha Tsui, Hong Kong',
                addressTc: '香港尖沙咀梳士巴利道18號'
              },
              services: [
                {
                  title: 'Tai Pan Reflexology Parlour — fatigue only',
                  titleTc: '大班公館・疲勞時才去',
                  note: 'Near Sasa Inn; use only if the group genuinely wants extra recovery.',
                  navigateTo: '83 Nathan Road, Tsim Sha Tsui, Hong Kong'
                }
              ],
              foods: [
                {
                  title: 'Kung Wo Beancurd Factory',
                  titleTc: '公和荳品廠',
                  note: 'Named light snack explicitly embedded in the Sham Shui Po dinner timeline. Skip if >10 min.',
                  navigateTo: '香港深水埗北河街118號',
                  addressTc: '香港深水埗北河街118號'
                },
                {
                  title: "Let's Yum Cha — Fuk Wing Street",
                  titleTc: '飲茶點心（福榮街）',
                  note: 'Named same-neighborhood dinner fallback explicitly embedded in the Oi Man Sang timeline when the dai-pai-dong queue exceeds 15 min.',
                  navigateTo: '香港深水埗福榮街116號',
                  addressTc: '香港深水埗福榮街116號'
                }
              ]
            },
            foodRecommendation: 'Kung Wo 公和荳品廠 (small snack) → Oi Man Sang 愛文生; >15-min queue → Let\'s Yum Cha',
            proteinPlan: 'Target ~150 g: after the gym, use Sham Shui Po for a real protein meal—beef, chicken, tofu/soy or fish-ball snacks—then make Oi Man Sang dinner meat/seafood first. Kung Wo is a small tasting stop, not the meal base. · 目標約150g：健身後在深水埗以牛、雞、豆腐／豆品或魚蛋補蛋白；愛文生晚餐以肉／海鮮為主。公和荳品只是小份嚐鮮，不當主餐。',
            insiderTip: 'This day is now hands-on rather than museum-led: one local-price escape room, a working-neighborhood street hunt, dai-pai-dong dinner and WestK night walk. If language support for LOST is weak, skip it rather than compromising the day.'
          },

          {
            id: 'day-14',
            dayNum: '14',
            shortLabel: 'Lantau / 大嶼山',
            city: 'Hong Kong / 香港',
            dateString: 'Fri, Dec 11, 2026',
            timeZone: 'Asia/Hong_Kong',
            title: 'Ngong Ping 360 → Tai O Loop → Kowloon Harbour Night Walk',
            titleTc: '昂坪360・大澳環線・九龍維港夜走',
            hotelRef: 'hk',
            transitSummary: 'MTR -> Cable Car -> Bus 21 -> Bus 11 loop',
            weatherExpected: '~19°C • Mountain & coastal breeze',
            rainBackupAvailable: true,
            easyPlan: null,
            leaveByTime: '9:30 AM from hotel',
            timeline: [
              {
                time: '9:30 AM – 10:20 AM',
                title: 'Hotel ➔ Kowloon Station ➔ Tung Chung',
                titleTc: '飯店 → 九龍站 → 東涌站',
                icon: 'train',
                notes: 'With 3 people, use a short red metered taxi to Kowloon Station only if it meaningfully simplifies the transfer; otherwise walk/MTR. Then take the Tung Chung Line to Tung Chung.',
                navigateTo: 'Kowloon MTR Station, West Kowloon',
                guide: {
                  intro: 'Smooth transit to Lantau Island base.',
                  steps: [
                    { label: 'Taxi & MTR', detail: 'Cheap/convenient rule: if everyone is fresh, walk/MTR to Kowloon Station; with timing pressure or tired legs, split a ~5-minute red metered taxi. Then tap Octopus onto the orange Tung Chung Line.' },
                    { label: 'Ride', detail: 'Ride 30 minutes west across Lantau Channel to Tung Chung Terminus (Exit B).' }
                  ]
                }
              },
              {
                time: '~10:30 AM – 11:00/11:15 AM',
                title: 'Ngong Ping 360 Crystal Cable Car Cabin',
                titleTc: '昂坪360東涌纜車站',
                icon: 'eye',
                notes: 'Weekday service opens at 10:00 AM. A 9:30 hotel departure should put you at Tung Chung around 10:20; walk to the terminal and target the first practical booked Crystal Cabin around 10:30–10:45 without manufacturing an early start.',
                navigateTo: '香港大嶼山東涌達東路11號',
                addressTc: '香港大嶼山東涌達東路11號',
                guide: {
                  intro: '5.7km cable car crossing over Tung Chung Bay and North Lantau Country Park.',
                  steps: [
                    { label: 'Boarding Line', detail: 'Walk 3 minutes from MTR Exit B to terminal. Use restrooms before boarding line if needed. Join booked Crystal Cabin lane.' },
                    { label: 'Crystal Cabin Experience', detail: 'Cabin features 3-layer glass floor. Look straight down at hiking trails, waterfalls, and Tung Chung Bay waters (only water permitted in cabins).' },
                    { label: 'Views', detail: 'Take photos of Hong Kong-Zhuhai-Macau bridge and giant Tian Tan Buddha emerging over mountain ridges.' }
                  ]
                }
              },
              {
                time: '~11:00/11:15 AM – 12:10 PM',
                title: 'Tian Tan Big Buddha & Po Lin Monastery',
                titleTc: '天壇大佛 & 寶蓮禪寺',
                icon: 'landmark',
                notes: 'Iconic first-timer stop, but cap Buddha + Po Lin at ~60 min. Scenic cable-car/mountain context is the value; no extended religious visit.',
                navigateTo: '香港大嶼山昂坪寶蓮禪寺',
                addressTc: '香港大嶼山昂坪寶蓮禪寺',
                guide: {
                  intro: 'Outdoor bronze seated Buddha and historic monastery.',
                  steps: [
                    { label: 'Skip Retail Village', detail: 'Walk briskly through Ngong Ping retail village; do not lose time in commercial souvenir shops.' },
                    { label: '268 Steps', detail: 'Climb 268 granite steps to base of 34-meter bronze Buddha at a comfortable pace.' },
                    { label: 'Lotus Terrace', detail: 'Circle base for 360-degree mountain and South China Sea views.' },
                    { label: 'Po Lin Quick Pass', detail: 'If convenient, do a brief courtyard/hall exterior pass after descending. No long temple loop; leave the zone around ~12:10 PM.' }
                  ]
                }
              },
                            {
                time: '12:10 PM – 1:05 PM',
                title: 'Ngong Ping Bus Buffer + Packed Protein Lunch',
                titleTc: '昂坪公車緩衝＋自帶蛋白午餐',
                icon: 'backpack',
                notes: 'Do not force a mediocre tourist-village meal. Carry a simple 7-ELEVEN protein lunch from Kowloon, eat it here, and protect Bus 21 to Tai O.',
                noMap: true,
                guide: {
                  intro: 'A logistics-first lunch block where the mountain transport connection has more value than restaurant hunting.',
                  steps: [
                    { label: 'Pack Before Leaving', detail: 'Buy eggs, milk/soy milk, chicken/lean meat, fruit and a simple carb from a 7-ELEVEN near Sasa Inn before the Lantau trip.' },
                    { label: 'Eat', detail: 'After Big Buddha, eat the packed lunch around Ngong Ping without entering a restaurant queue.' },
                    { label: 'Bus Buffer', detail: 'Use restroom and walk to Ngong Ping Bus Terminus by ~1:05–1:08 PM. Bus 21 timing is the hard constraint.' }
                  ]
                }
              },
                            {
                time: '1:20 PM – 4:10 PM',
                title: 'Tai O Fishing Village + Tai O Bakery',
                titleTc: '大澳漁村＋大澳餅店沙翁',
                icon: 'ship',
                notes: 'Walk the stilt-house lanes and use Tai O Bakery as the single named snack stop. Keep any sampan ride optional and subordinate to the Bus 11 return.',
                navigateTo: '吉慶街66號 大嶼山, Tai O, Hong Kong',
                addressTc: '香港大嶼山大澳吉慶街66號',
                guide: {
                  intro: 'Fishing-village walk with one vetted local bakery stop, not an open-ended seafood-snack crawl.',
                  steps: [
                    { label: 'Bus 21', detail: 'Ride from Ngong Ping to Tai O and orient at Tai Chung Bridge.' },
                    { label: 'Stilt Lanes', detail: 'Walk the canals, stilt-house lanes and quieter side paths beyond the first visitor cluster.' },
                    { label: 'Optional Boat', detail: 'Take a ~20-minute local sampan only if weather is good, price is clear and the queue is short. Dolphin sightings are a bonus, never the reason to book.' },
                    { label: 'Named Snack', detail: 'At Tai O Bakery 大澳餅店, 吉慶街66號, share a freshly fried sugar doughnut / 沙翁. It is strongly reviewed across independent platforms; skip if the queue is >10–15 min.' },
                    { label: 'Exit', detail: 'Start returning early enough to be at Tai O Bus Terminus by ~4:10 PM. The target Bus 11 is 4:25 PM; do not use that 15-minute buffer for one more snack or boat loop.' }
                  ],
                  recheck: 'Night before: recheck Bus 21/11 schedules and Tai O Bakery Friday hours.'
                }
              },
              {
                time: '4:25 PM – ~5:15 PM',
                title: 'Direct Bus 11 from Tai O back to Tung Chung MTR',
                titleTc: '新大嶼山巴士11號：大澳 → 東涌',
                icon: 'bus',
                notes: 'Friday target is Bus 11 at 4:25 PM. Treat 4:35 PM as the first backup and 4:45 PM as the second — not as planned later departures. Do not backtrack to the cable car.',
                navigateTo: 'Tai O Bus Terminus, Lantau Island, Hong Kong',
                addressTc: '大澳巴士總站',
                guide: {
                  intro: 'Loop route return: direct mountain highway bus bypassing cable car queue.',
                  steps: [
                    { label: 'Timetable Verification', detail: 'Recheck the Friday New Lantao Bus 11 schedule the night before. Target 4:25 PM; use 4:35 PM only if you miss it, then 4:45 PM as the second fallback.' },
                    { label: 'Boarding Buffer', detail: 'Begin walking toward Tai O terminus 15 minutes ahead. Do not allow a boat ride or snack line to jeopardize this connection.' },
                    { label: 'Board Bus 11', detail: 'Tap Octopus on New Lantao Bus 11 at Tai O Terminus. Do NOT backtrack to cable car; Bus 11 takes you directly to Tung Chung MTR.' },
                    { label: 'Ride', detail: 'Official Route 11 guidance lists an approximately 52-minute end-to-end ride. Use the live ETA board because traffic and individual stop patterns can vary.' },
                    { label: 'MTR Return', detail: 'Alight at Tung Chung Station. Take Tung Chung Line direct to Kowloon Station.' }
                  ]
                }
              },
              {
                time: '~6:10 PM – 7:20 PM',
                title: 'Australia Dairy Company — Jordan Dinner',
                titleTc: '澳洲牛奶公司',
                icon: 'utensils',
                notes: 'Friday is the right day for this classic cha chaan teng. Keep dinner efficient so the night can continue south through Kowloon Park to the harbour rather than ending at 7:45 PM.',
                navigateTo: 'Australia Dairy Company, Jordan, Hong Kong',
                guide: {
                  intro: 'Fast, iconic but route-compatible post-Lantau dinner instead of leaving the day with an undefined meal.',
                  steps: [
                    { label: 'Return', detail: 'From Tung Chung, take the Tung Chung Line back toward Kowloon, then continue to Jordan/TST with the simplest live MTR/taxi option.' },
                    { label: 'Order', detail: 'Try scrambled eggs/toast, macaroni soup with ham, steamed milk/egg pudding or another classic cha chaan teng combination. Add a meat/egg-heavy dish so dinner supports the protein target.' },
                    { label: 'Queue Rule', detail: 'If the line is >~10–15 minutes, skip immediately and walk next door to Mak Man Kee Noodle Shop 麥文記麵家 (51 Parkes St), already vetted for the arrival night. Do not queue after an all-day Lantau loop.' }
                  ]
                }
              },
              {
                time: '~7:25 PM – 9:45 PM',
                title: 'Kowloon Park ➔ Tsim Sha Tsui Promenade Night Walk',
                titleTc: '九龍公園 → 尖沙咀海濱夜走',
                icon: 'footprints',
                notes: 'A natural southbound walk from Jordan to the hotel area: greenery first, then the harbour skyline. Kowloon Park is open until midnight; the TST promenade is the official 8 PM Symphony of Lights vantage area.',
                navigateTo: 'Kowloon Park, Tsim Sha Tsui, Hong Kong',
                addressTc: '香港九龍公園',
                guide: {
                  intro: 'After-dinner park + harbour sequence with no extra ticket or cross-city transfer.',
                  steps: [
                    { label: 'Park', detail: 'From Australia Dairy, enter Kowloon Park from the Austin/Jordan side and walk south through the gardens/paths rather than staying on Nathan Road.' },
                    { label: '8 PM Decision', detail: 'If dinner finishes on time, continue toward the Clock Tower/TST waterfront for the 8:00 PM Symphony of Lights. If you are running late, do not sprint—just enjoy the skyline after the show.' },
                    { label: 'Promenade', detail: 'Walk east from the Clock Tower along the Tsim Sha Tsui Promenade / Avenue of Stars for harbour reflections and night photography.' },
                    { label: 'No Duplication Rule', detail: 'This is a ground-level skyline walk. Aqua Luna tomorrow is the water-based harbour experience, so do not add another cruise tonight.' },
                    { label: 'Hotel', detail: 'Turn back around 9:30 PM and reach Sasa Inn by roughly 9:45–10:00 PM.' }
                  ]
                }
              }
            ],
            rainPlan: 'Light / moderate rain: Keep Lantau if Ngong Ping 360 and buses are operating; wear rain jackets/umbrellas (expect misty views). Cable car suspended or excessive queue: take Bus 23 from Tung Chung to Ngong Ping to preserve Big Buddha → Tai O → Bus 11 loop. Severe weather: use an indoor HK flex day instead. Keep Saturday’s Brands Expo + 5:30 PM Aqua Luna plan intact.',
            backups: {
              activity: {
                title: 'Bus 23 directly Tung Chung ➔ Ngong Ping',
                titleTc: '新大嶼山巴士23號',
                note: 'Cable-car closure/queue fallback that preserves the Buddha → Tai O → Bus 11 loop.',
                navigateTo: 'Tung Chung Station Bus Terminus, Lantau Island'
              },
              foods: [
                {
                  title: 'Mak Man Kee Noodle Shop',
                  titleTc: '麥文記麵家',
                  note: 'Named same-block fallback if Australia Dairy Company has a >10–15 min queue; already vetted on the arrival night.',
                  navigateTo: '香港佐敦白加士街51號',
                  addressTc: '香港佐敦白加士街51號'
                }
              ]
            },
            foodRecommendation: 'Packed 7-ELEVEN protein lunch → Tai O Bakery 大澳餅店 → Australia Dairy Company 澳洲牛奶公司',
            proteinPlan: "Target ~150 g: front-load breakfast with eggs + milk/soy milk + chicken/lean protein, then use the packed 7-ELEVEN lunch as a deliberate protein meal at Ngong Ping. At Australia Dairy Company prioritize eggs/ham/meat and milk-based items; Tai O Bakery is just a shared sweet. · 目標約150g：早餐先用蛋＋牛奶／豆漿＋雞胸／瘦肉打底；昂坪直接吃事先準備的7-ELEVEN高蛋白午餐。澳洲牛奶公司以蛋、火腿／肉類與奶類為主；大澳餅店沙翁只是分食甜點。",
            insiderTip: 'A 9:30 AM hotel departure works. Protect the 1:20 PM Bus 21, then be back at Tai O terminus by ~4:10 PM for the 4:25 PM Bus 11; 4:35 and 4:45 are backups, not the plan.'
          },

          {
            id: 'day-15',
            dayNum: '15',
            shortLabel: 'Finale / 尾聲',
            city: 'Hong Kong / 香港',
            dateString: 'Sat, Dec 12, 2026',
            timeZone: 'Asia/Hong_Kong',
            title: '60th Brands Expo → 5:30 PM Aqua Luna → Finale Dinner',
            titleTc: '第60屆工展會・Aqua Luna 黃昏船・最後晚餐',
            hotelRef: 'hk',
            transitSummary: 'Ding Ding Tram & Wooden Junk Boat',
            weatherExpected: '~20°C • Mild evening conditions',
            rainBackupAvailable: true,
            easyPlan: "If tired, shorten time at Brands Expo. Preserve 5:30 PM Aqua Luna sunset sail.",
            leaveByTime: '10:25 AM from hotel',
            timeline: [
              {
                time: '11:00 AM – 12:00 PM',
                title: "Maxim's Palace City Hall (backup: One Dim Sum Central) — Trolley Dim Sum",
                titleTc: '美心皇宮大會堂（備案：一點心中環）・推車點心',
                icon: 'utensils',
                notes: 'Old-school trolley dim sum with a huge independent review base; weekend queue risk is controlled with a strict cutoff and a named Central backup.',
                navigateTo: '2/F Low Block, Hong Kong City Hall, Central, Hong Kong',
                addressTc: '香港中環愛丁堡廣場5號 香港大會堂低座2樓',
                guide: {
                  intro: 'Experience-first dim sum with a hard queue guardrail.',
                  steps: [
                    { label: 'Arrival', detail: 'Leave Sasa around 10:25 AM and head straight to City Hall using the fastest sensible MTR / harbour-crossing route. Target the 11:00 AM opening-area lunch without manufacturing an early morning activity.' },
                    { label: 'Primary', detail: "At Maxim's Palace City Hall 美心皇宮, use the trolley service for har gow, siu mai, char siu bao, steamed ribs and one dessert. Share 4–6 baskets across 3." },
                    { label: 'Queue Rule', detail: 'Weekend lines can be substantial. If the quoted/visible wait is >15 minutes, DO NOT wait 30–60 minutes for nostalgia.' },
                    { label: 'Backup', detail: 'Walk to One Dim Sum Central 一點心中環, 44 Lyndhurst Terrace, for fast dim sum. It is the explicit high-rated fallback.' },
                    { label: 'Transit', detail: 'By noon, continue east by Ding-Ding / MTR toward Causeway Bay and Victoria Park.' }
                  ],
                  recheck: 'Recheck City Hall Saturday opening and whether any queue-number app/process changes before Dec 12.'
                }
              },
              {
                time: '12:10 PM – 12:50 PM',
                title: 'Ding-Ding Tram to Causeway Bay',
                titleTc: '香港電車：中環 → 銅鑼灣',
                icon: 'train',
                notes: 'Board historic double-decker Ding-Ding tram on Des Voeux Rd Central and enjoy an unhurried ride across HK Island to Victoria Park.',
                navigateTo: 'Des Voeux Road Central, Central, Hong Kong',
                guide: {
                  intro: 'Upper-deck ride on world’s only fully double-decker tram fleet.',
                  steps: [
                    { label: 'Boarding', detail: 'From City Hall / Central, walk to a convenient eastbound stop on Des Voeux Road Central and board through the rear gate (pay only upon exiting at front).' },
                    { label: 'Upper Deck Front', detail: 'Climb spiral stairs to upper deck; sit in front rows for unobstructed view through street signboards.' },
                    { label: 'Alight', detail: 'Alight at Paterson Street / Victoria Park stop in Causeway Bay. Tap Octopus at front turnstile.' }
                  ]
                }
              },
              {
                time: '1:00 PM – 3:30 PM',
                title: '60th Brands Expo at Victoria Park',
                titleTc: '維多利亞公園 (第60屆香港工展會)',
                icon: 'sparkles',
                notes: 'Opening day at Victoria Park: 900+ booths across 11 zones. Standard admission HK$10. HKTB currently lists free admission for visitors to Hong Kong who register on-site with a valid travel document — bring passport and recheck before Dec 12.',
                navigateTo: '香港銅鑼灣高士威道 維多利亞公園',
                addressTc: '香港銅鑼灣高士威道 維多利亞公園',
                guide: {
                  intro: 'Hong Kong’s 60th anniversary outdoor consumer and food exhibition.',
                  steps: [
                    { label: 'Admission', detail: 'Standard admission is HK$10. HKTB currently lists free admission for visitors to Hong Kong who register on-site with a valid travel document. The organizer’s fair-details page does not currently show that visitor promotion, so bring a passport and recheck the HKTB / organizer pages shortly before Dec 12.' },
                    { label: 'Fair Navigation', detail: 'Grab a fair ground map. Do not attempt all 900 booths.' },
                    { label: 'Priority Zones', detail: 'Prioritize Hong Kong Brands Square, Food & Beverage, Grocery & Noodles, and Hometown Flavors.' },
                    { label: 'Sampling Strategy', detail: 'Sample local pastries, sauces, and noodle bites before purchasing.' },
                    { label: 'Take-Home Products', detail: 'For anything intended for U.S. entry, prefer clearly labeled, commercially packaged non-meat products (e.g. sealed tea, packaged cookies/biscuits) and keep the packaging/receipt. Avoid heavy glass jars or meat-containing items.' },
                    { label: 'Exit Timing', detail: 'Begin wrapping up around 3:15 PM and be out by ~3:30 PM. Return toward Tsim Sha Tsui immediately; you still retain a comfortable reset buffer before the fixed 5:10 PM Aqua Luna pier arrival.' }
                  ]
                }
              },
              {
                time: '5:10 PM check-in · 5:30 PM – 6:15 PM sail',
                title: 'Aqua Luna Sunset Sail — Tsim Sha Tsui Pier 1',
                titleTc: '尖沙咀1號公眾碼頭 (張保仔號)',
                icon: 'ship',
                notes: 'Arrive by 5:10 PM for the official 5:30 PM Tsim Sha Tsui pickup. The published evening harbour cruise is 45 minutes and includes one drink; winter sunset is around 5:40 PM.',
                navigateTo: '尖沙咀1號公眾碼頭',
                addressTc: '尖沙咀1號公眾碼頭',
                guide: {
                  intro: 'Sunset sail on a traditional handcrafted red-sailed wooden junk boat.',
                  steps: [
                    { label: 'Arrival by 5:10 PM', detail: 'Arrive at Tsim Sha Tsui Public Pier 1 (near Clock Tower). Have Aqua Luna mobile booking voucher ready.' },
                    { label: 'Check-In', detail: 'Locate Aqua Luna check-in staff at the pier head.' },
                    { label: 'Boarding', detail: 'Board traditional wooden junk boat when instructed. Pick any comfortable open outdoor or lounge seating.' },
                    { label: 'Golden Hour', detail: 'Enjoy panoramic harbor views as red sails billow against 5:40 PM winter sunset over Victoria Harbour.' },
                    { label: 'Included Drink', detail: 'Savor included beverage from the bar once boat is underway.' },
                    { label: 'Disembark', detail: 'Expect the 45-minute cruise to finish around 6:15 PM at the booked disembarkation point. Confirm the selected pier/time on the voucher, then head to dinner without scheduling anything else on the harbour.' }
                  ]
                }
              },
              {
                time: '~7:00 PM – 8:45 PM',
                title: 'Yat Tung Heen at Eaton (backup: DimSumHere) — Finale Dinner',
                titleTc: '逸東軒（Eaton HK）',
                icon: 'utensils',
                notes: 'Route-efficient celebratory Cantonese dinner in Jordan after Aqua Luna. Current Saturday dinner hours cover the slot and the restaurant offers direct reservations. Attempt ~7:00 PM only if booking is free with no deposit/prepayment/card guarantee.',
                navigateTo: 'Yat Tung Heen, Eaton HK, Jordan, Hong Kong',
                guide: {
                  intro: 'A special final meal without crossing the city again after the harbor sail.',
                  steps: [
                    { label: 'Transfer', detail: 'After Aqua Luna, move from TST Pier toward Jordan/Eaton with the simplest live MTR or short red-taxi route. Build ~20–30 minutes of buffer.' },
                    { label: 'Reservation Rule', detail: 'Try for ~7:00 PM via the direct reservation flow, but keep it only if there is no prepayment, non-refundable deposit or card guarantee.' },
                    { label: 'Order', detail: 'Choose Cantonese roast/meat, seafood, dim-sum-style specialties and vegetables family-style. Let the staff steer you toward signature dishes that fit 3 people rather than over-ordering.' },
                    { label: 'Fallback', detail: 'If reservation terms are annoying or Yat Tung Heen cannot accommodate you, use DimSumHere 點心到 at 298 Temple St in Jordan (high review volume, open through dinner). It is less ceremonial but maximally route-safe. Do not cross the harbor for one dish.' }
                  ]
                }
              },
                            {
                time: '8:55 PM – 10:00 PM',
                title: 'Kai Kai Dessert — Jordan Finale Sweet',
                titleTc: '佳佳甜品・佐敦最後甜品',
                icon: 'utensils',
                notes: 'Specific, high-volume Jordan dessert stop after Yat Tung Heen. Recent traveler reviews confirm quality but also warn of occasional long waits, so this is optional and queue-capped.',
                navigateTo: '香港佐敦白加士街113-115號地下',
                addressTc: '香港佐敦白加士街113-115號地下',
                guide: {
                  intro: 'One final named dessert, then pack.',
                  steps: [
                    { label: 'Walk', detail: 'From Eaton/Yat Tung Heen, walk toward Kai Kai Dessert 佳佳甜品 on Parkes Street.' },
                    { label: 'Order', detail: 'Share 1–2 bowls such as black sesame paste, walnut sweet soup or ginger sweet-potato soup.' },
                    { label: 'Queue Rule', detail: 'If the line is >10–15 min, skip dessert. Do not spend 40 minutes waiting on the final packing night.' },
                    { label: 'Pack', detail: 'Return to Sasa Inn and finish luggage for the morning in-town check-in.' }
                  ]
                }
              }
            ],
            rainPlan: 'Check marine and weather forecast Friday morning. If Saturday conditions look poor, use Aqua Luna\'s permitted advance reschedule where available. Keep Brands Expo / Causeway Bay as daytime plan regardless.',
            backups: {
              activity: {
                title: 'Causeway Bay & Tai Hang Stroll',
                titleTc: '銅鑼灣 & 大坑小區',
                note: 'Casual neighborhood walk if the Brands Expo finishes early; keep the 5:30 PM Aqua Luna fixed.',
                navigateTo: 'Tai Hang, Causeway Bay, Hong Kong'
              },
              foods: [
                {
                  title: 'DimSumHere — Jordan',
                  titleTc: '點心到（佐敦）',
                  note: 'Named route-safe finale-dinner fallback if Yat Tung Heen cannot be booked on acceptable terms; 298 Temple Street, Jordan.',
                  navigateTo: '香港油麻地廟街298號',
                  addressTc: '香港油麻地廟街298號'
                },
                {
                  title: 'One Dim Sum Central',
                  titleTc: '一點心 中環',
                  note: 'Named dim-sum backup explicitly referenced in the Maxim’s City Hall timeline if the trolley-dim-sum wait exceeds 15 minutes.',
                  navigateTo: 'G/F, 44 Lyndhurst Terrace, Central, Hong Kong',
                  addressTc: '香港中環擺花街44號地下'
                }
              ]
            },
            foodRecommendation: 'Maxim\'s Palace City Hall → Yat Tung Heen 逸東軒 → Kai Kai Dessert 佳佳甜品',
            proteinPlan: 'Target ~150 g: trolley dim sum can be high-protein if you prioritize shrimp dumplings, siu mai, beef balls, steamed ribs and roast meats. At the finale dinner go seafood/meat-heavy; treat expo samples, egg tarts and tong sui as shared extras. · 目標約150g：推車點心可很高蛋白，先吃蝦餃、燒賣、牛肉丸、蒸排骨與燒味。最後晚餐以海鮮／肉為主；展銷會試吃、蛋撻、糖水當分食加碼。',
            insiderTip: 'The second Hong Kong gym session is gone. Leave around 10:25 AM for 11:00 dim sum, then Ding-Ding → Brands Expo; this protects the 5:10 PM Aqua Luna check-in without wasting the final morning on routine lifting.'
          },

          {
            id: 'day-16',
            dayNum: '16',
            shortLabel: 'Home / 返程',
            city: 'Departure / 返程',
            dateString: 'Sun, Dec 13, 2026',
            timeZone: 'Asia/Hong_Kong',
            title: 'Kowloon In-Town Check-in → Bakehouse → Flight to NYC',
            titleTc: '九龍市區預辦登機・Bakehouse・返紐約',
            hotelRef: 'hk',
            transitSummary: 'In-Town Check-in -> Express -> CX840',
            weatherExpected: '~19°C • Mild daytime conditions',
            rainBackupAvailable: false,
            easyPlan: null,
            leaveByTime: '9:30 AM from hotel',
            timeline: [
              {
                time: '9:45 AM – 10:15 AM',
                title: 'Cathay In-Town Check-in & Bag Drop at Kowloon Station',
                titleTc: '港鐵九龍站 市區預辦登機大堂',
                icon: 'train',
                notes: 'Leave hotel at 9:30 AM. Kowloon desk open 6:00 AM–3:00 PM. Drop checked bags early.',
                navigateTo: '港鐵九龍站 市區預辦登機大堂',
                addressTc: '港鐵九龍站 市區預辦登機大堂',
                guide: {
                  intro: 'Hands-free departure: checking bags at downtown rail station hours before flight.',
                  steps: [
                    { label: 'Carry-On Check', detail: 'Before leaving hotel, ensure all power banks, lithium batteries, passports, medication, and fragile goods stay in carry-on daypacks.' },
                    { label: 'Taxi to Kowloon Station', detail: 'For luggage, use a ~5-minute red metered taxi from the hotel to Kowloon Station In-Town Check-In Hall. Street/stand taxi first; DiDi Taxi / Uber Meter Taxi only if dispatch is more convenient.' },
                    { label: 'Airport Express Turnstile', detail: 'Enter check-in area using valid Airport Express ticket or Octopus (fare deducted upon entering; tap same payment at platform later).' },
                    { label: 'Smart Check-in Kiosk', detail: 'Scan passport, confirm flight details, select seats, and print physical boarding passes and luggage tags.' },
                    { label: 'Self Bag Drop', detail: 'Attach bag tags, place luggage onto self bag-drop belt, scan tag barcode, and collect bag claim receipts.' },
                    { label: 'Hands-Free Freedom', detail: 'Once bags are accepted, walk out of station completely luggage-free.' }
                  ]
                }
              },
                            {
                time: '10:30 AM – 11:25 AM',
                title: 'Bakehouse TST + Kee Wah Bakery — Pastry/Gift Haul',
                titleTc: 'Bakehouse 尖沙咀＋奇華餅家・伴手禮',
                icon: 'utensils',
                notes: 'Both stops are now explicit. Bakehouse is the fresh-pastry target; Kee Wah is the packaged-gift fallback/add-on. Hard-cap the queue because a real pre-flight lunch follows.',
                navigateTo: '44 Hankow Rd, Tsim Sha Tsui, Kowloon, Hong Kong',
                addressTc: '香港尖沙咀漢口道44號',
                guide: {
                  intro: 'Short hands-free bakery/gift window after downtown bag drop.',
                  steps: [
                    { label: 'Bakehouse', detail: 'At Bakehouse TST, buy only the amount of sourdough egg tarts/pastries you can carry flat in cabin.' },
                    { label: 'Queue Rule', detail: 'If Bakehouse is >15 minutes, skip it; flight-day schedule matters more than pastries.' },
                    { label: 'Kee Wah', detail: 'For sturdy packaged gifts, use nearby Kee Wah Bakery 奇華餅家. Prefer clearly labeled non-meat products for U.S. entry.' },
                    { label: 'Declare Food', detail: 'Keep packaging/receipts and declare food/agricultural products on U.S. arrival; CBP/USDA makes final admissibility decisions.' }
                  ]
                }
              }
,
              {
                time: '11:35 AM – 12:35 PM',
                title: 'One Dim Sum TST — Pre-Flight Lunch',
                titleTc: '一點心 尖沙咀・登機前午餐',
                icon: 'utensils',
                notes: 'Named, well-reviewed TST lunch near the hotel corridor. Eat here before the Airport Express instead of gambling on a lower-rated airport restaurant after security.',
                navigateTo: '香港尖沙咀赫德道4號地下',
                addressTc: '香港尖沙咀赫德道4號地下',
                guide: {
                  intro: 'Proper final Hong Kong meal with a generous Airport Express buffer.',
                  steps: [
                    { label: 'Walk', detail: 'From the bakery/gift block, walk to One Dim Sum TST 一點心尖沙咀, Hart Avenue 4.' },
                    { label: 'Order', detail: 'Share 4–6 baskets emphasizing siu mai, beef balls, ribs, char siu / meat-filled items and one vegetable; keep dessert light because Bakehouse was just before.' },
                    { label: 'Queue Rule', detail: 'If the wait is >15 minutes, skip the sit-down and buy a fast protein meal from the nearest 7-ELEVEN / supermarket. Do not erode the airport buffer.' },
                    { label: 'Exit', detail: 'Finish by ~12:35 PM. Head toward Kowloon Station around 12:50–1:00 PM, leaving plenty of room for the 1:30 PM Airport Express.' }
                  ]
                }
              },
              {
                time: '1:30 PM – 2:00 PM',
                title: 'Airport Express Train to HKG Airport',
                titleTc: '機場快綫：九龍站 → 機場站',
                icon: 'train',
                notes: 'Breeze through security since checked luggage was handled hours ago.',
                navigateTo: 'Kowloon MTR Station, West Kowloon',
                guide: {
                  intro: 'Fast 22-minute rail ride directly into Terminal 1.',
                  steps: [
                    { label: 'Boarding', detail: 'Board Airport Express at Kowloon Station.' },
                    { label: 'Airport Arrival', detail: 'Train doors open directly into HKG Terminal 1 departure hall. Walk straight through security and immigration.' }
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
                notes: 'Cathay Pacific CX840: HKG ➔ JFK. Current published winter schedule for your date is 4:35 PM departure and 7:05 PM arrival same calendar day in NYC (~15h30 duration). Manage Booking / boarding pass is final authority.',
                noMap: true,
                guide: {
                  intro: 'Transpacific flight home crossing International Date Line.',
                  steps: [
                    { label: 'Gate', detail: 'Check boarding pass for actual boarding time. Carry Bakehouse egg tart boxes carefully under seat in front of you.' },
                    { label: 'In-Flight', detail: 'Non-stop ~15h 30m flight crossing the International Date Line. Current published schedule lands at JFK Sunday evening at 7:05 PM same calendar day.' }
                  ]
                }
              }
            ],
            backups: {
              foods: [
                {
                  title: 'Kee Wah Bakery',
                  titleTc: '奇華餅家',
                  note: 'Named packaged-gift fallback/add-on explicitly referenced in the Bakehouse timeline.',
                  navigateTo: 'Tsim Sha Tsui, Hong Kong'
                }
              ]
            },
            foodRecommendation: 'Bakehouse TST / Kee Wah Bakery gifts → One Dim Sum TST pre-flight lunch → CX840 meal service',
            proteinPlan: 'Travel-day target ~150 g if practical: if hungry before the bakery haul, use 7-ELEVEN near Sasa Inn for eggs/milk/soy milk; make One Dim Sum TST the real lunch, then use the CX840 meal service to finish the day. Bakehouse is a treat/gift stop, not the meal base. · 旅行日若方便仍以約150g為目標：買Bakehouse前若餓，先在Sasa Inn附近7-ELEVEN補蛋／牛奶／豆漿；One Dim Sum TST當正式午餐，再用CX840機上餐補足。Bakehouse是伴手禮／甜點，不當主餐。',
            insiderTip: 'Carry pastries flat in the cabin, keep the receipt, and declare all food/agricultural items on U.S. arrival.'
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
          return [this.relevantPlan.label, item?.time || this.relevantPlan.day.shortLabel].filter(Boolean).join(' · ');
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
          window.addEventListener('offline', () => this.showToast('Offline mode — the saved itinerary is still available', 'warning'));
          window.addEventListener('online', () => this.showToast('Back online'));
          this.applyAppearance();
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyAppearance());
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
            if (!commandSearch && !slashSearch) return;
            event.preventDefault();
            this.openGlobalSearch();
          });

          this.sanitizePersistentState();
          this.runSemanticQa();
          document.documentElement.classList.toggle('data-saver', Boolean(navigator.connection?.saveData));
          this.determineCurrentDay();
          this.nowTick = Date.now();
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
          setInterval(() => this.refreshLiveContext(true), 60000);
          this.refreshExchangeRates();
          this.refreshIcons();
          this.syncThemeColor();
          this.$nextTick(() => this.scrollActiveDayChip(true));
          if (this.smartLaunchActive) {
            window.setTimeout(() => requestAnimationFrame(() => this.positionRelevantPlan({ targetKind: 'day-summary' }, 'auto')), 120);
          }

          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
              this.refreshLiveContext(true);
              this.refreshExchangeRates();
              this.$nextTick(() => this.scrollActiveDayChip());
            }
          });
          window.addEventListener('pageshow', () => {
            if (!document.hidden) this.refreshLiveContext(true);
          });

          this.$watch('activeTab', (val) => {
            setStorage('twhk_active_tab_v10', JSON.stringify(val));
            this.refreshIcons();
            this.animateContent('.tab-pane');
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
            setStorage('twhk_active_day_v10', JSON.stringify(val));
            this.takeItEasyActive = false;
            this.rainPlanActive = false;
            this.syncThemeColor();
            this.refreshIcons();
            // Keep the selected chip centred so adjacent days remain reachable.
            this.$nextTick(() => this.scrollActiveDayChip(true));
          });

          this.$watch('takeItEasyActive', () => this.refreshIcons());
          this.$watch('rainPlanActive', () => this.refreshIcons());
          this.$watch('selectedCityFilter', () => this.refreshIcons());
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
        },

        get countdownShortText() {
          const text = String(this.countdownText || '');
          const countdown = text.match(/^T-(\d+)d/i);
          if (countdown) return `T-${countdown[1]}d`;
          if (/^Day\s+/i.test(text)) return text;
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
          this.setMotionDirection(tabOrder.indexOf(this.activeTab), tabOrder.indexOf(tab));
          this.tabScrollPositions[this.activeTab] = window.scrollY || 0;
          const targetY = resetScroll ? 0 : (this.tabScrollPositions[tab] || 0);
          this.activeTab = tab;
          this.$nextTick(() => requestAnimationFrame(() => {
            if (this.activeTab === tab) window.scrollTo({ top: targetY, behavior: 'instant' });
          }));
        },

        switchPlanView(view, moveFocus = false) {
          if (!['bookings', 'prep'].includes(view)) return;
          if (view === this.planView) return;
          const viewOrder = ['bookings', 'prep'];
          this.setMotionDirection(viewOrder.indexOf(this.planView), viewOrder.indexOf(view));
          this.planView = view;
          if (moveFocus) this.$nextTick(() => document.getElementById(`plan-tab-${view}`)?.focus({ preventScroll: true }));
        },

        openPlan(view = 'bookings') {
          if (['bookings', 'prep'].includes(view)) this.planView = view;
          this.switchTab('plan', true);
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

          if (!this.prefersReducedMotion() && typeof document.startViewTransition === 'function') {
            document.documentElement.dataset.dayTransition = this.motionDirection;
            const transition = document.startViewTransition(commit);
            transition.finished.finally(() => delete document.documentElement.dataset.dayTransition);
          } else {
            this.activeDayId = dayId;
            this.playDayChange();
          }
        },

        selectDayFromStrip(dayId, positionPlan = { targetKind: 'day-summary' }) {
          if (!dayId || !this.days.some(day => day.id === dayId)) return;
          if (dayId === this.activeDayId) this.smartLaunchActive = false;
          else this.switchDay(dayId);
          this.$nextTick(() => requestAnimationFrame(() => {
            this.positionRelevantPlan(positionPlan, 'auto');
          }));
        },

        playDayChange() {
          this.animateContent('.hero-head, .today-content-grid');
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

        openLiveContext() {
          if (!this.relevantPlan?.day) return;
          const plan = { ...this.relevantPlan };
          if (plan.day.id !== this.activeDayId) this.switchDay(plan.day.id);
          this.switchTab('today', true);
          this.$nextTick(() => requestAnimationFrame(() => this.positionRelevantPlan(plan, this.prefersReducedMotion() ? 'auto' : 'smooth')));
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
          check(serialized.includes('CX400') && !serialized.includes('CX443'), 'Confirmed CX400 correction is missing.');
          check(serialized.includes('3:40 PM') && serialized.includes('4:40 PM'), 'Alishan train/bus anchors are missing.');
          check(serialized.includes('1:20 PM') && serialized.includes('4:25 PM'), 'Lantau Bus 21/11 anchors are missing.');
          check(serialized.includes('5:30 PM') && serialized.includes('Aqua Luna'), 'Aqua Luna sailing anchor is missing.');
          check(this.bookings.some(item => item.id === 'b-23'), 'Taiwan repeat-visitor draw eligibility check is missing.');
          check(!document.querySelector('details, summary'), 'Accordions are not allowed.');

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
          const normalized = this.normalizeSearchValue(query);
          if (!normalized) return [];
          const tokens = normalized.split(' ').filter(Boolean);
          const results = [];

          this.days.forEach(day => {
            const sources = this.buildDaySearchSources(day);
            const wholeDay = this.normalizeSearchValue(sources.map(s => s.text).join(' '));
            if (!tokens.every(token => wholeDay.includes(token))) return;

            const scored = sources.map(source => {
              const text = this.normalizeSearchValue(source.text);
              const label = this.normalizeSearchValue(source.label);
              const hits = tokens.filter(token => text.includes(token)).length;
              if (!hits) return null;
              const matchedAll = tokens.every(token => text.includes(token));
              let score = source.weight + hits * 9;
              if (matchedAll) score += 34;
              if (label.includes(normalized)) score += 54;
              if (text.includes(normalized)) score += 28;
              if (tokens.every(token => label.includes(token))) score += 18;
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
          this.showGlobalSearch = true;
          document.documentElement.classList.add('global-search-open');
          this.$nextTick(() => {
            this.refreshIcons();
            // $nextTick alone is too early: x-show has flipped the style but the element
            // has not painted yet, and focus() on a not-yet-visible node is a no-op.
            requestAnimationFrame(() => {
              if (!this.showGlobalSearch) return;
              const input = document.getElementById('global-itinerary-search');
              if (!input) return;
              input.focus({ preventScroll: true });
              const end = input.value.length;
              try { input.setSelectionRange(end, end); } catch (_) {}
            });
          });
        },

        closeGlobalSearch() {
          if (!this.showGlobalSearch) return;
          this.showGlobalSearch = false;
          document.documentElement.classList.remove('global-search-open');
          this.$nextTick(() => {
            const phoneTrigger = window.matchMedia('(max-width: 767px)').matches ? document.querySelector('.dock-search') : null;
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
          this.$nextTick(() => window.setTimeout(() => this.positionRelevantPlan(positionPlan, 'auto'), 100));
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
          return this.parseTimelineClock(matches[matches.length - 1][0]);
        },

        resolveRelevantPlan(nowValue = Date.now()) {
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

        timelineItemState(idx) {
          return this.isCurrentTimelineItem(idx) ? this.relevantPlan.state : '';
        },

        timelineItemLabel(idx) {
          return this.isCurrentTimelineItem(idx) ? this.relevantPlan.label : '';
        },

        timelineAccessibleLabel(item, idx) {
          const label = this.timelineItemLabel(idx);
          return [label, item.time, item.title].filter(Boolean).join('. ');
        },

        scrollToCurrentTimeline() {
          this.locateRelevantPlan();
        },

        locateRelevantPlan() {
          this.nowTick = Date.now();
          const plan = this.resolveRelevantPlan(this.nowTick);
          if (!plan) return;
          this.relevantPlan = plan;
          this.activeTab = 'today';
          this.activeDayId = plan.day.id;
          this.lastLiveTripDayId = plan.day.id;
          const positionPlan = plan.targetKind === 'event' ? plan : { targetKind: 'day-summary' };
          this.$nextTick(() => window.setTimeout(() => requestAnimationFrame(() => this.positionRelevantPlan(positionPlan, this.prefersReducedMotion() ? 'auto' : 'smooth')), 60));
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
          return ['today', 'itinerary', 'plan', 'toolkit'].includes(tab)
            || this.days.some(candidate => candidate.id === day);
        },

        shouldSmartLaunch() {
          return Boolean(this.liveTripDayId && !this.hasExplicitNavigation());
        },

        positionRelevantPlan(plan, behavior = 'auto') {
          if (!plan) return;
          let target = plan.targetKind === 'event'
            ? document.getElementById(`timeline-item-${plan.eventIndex}`)
            : plan.targetKind === 'day-summary' ? document.getElementById('day-summary') : null;
          if (!target) target = document.getElementById('day-complete-target');
          if (!target) return;
          const stickyBottom = [...document.querySelectorAll('.app-chrome, .day-strip-wrap')]
            .filter(element => getComputedStyle(element).position === 'sticky')
            .reduce((bottom, element) => {
              const top = parseFloat(getComputedStyle(element).top);
              const pinnedBottom = (Number.isFinite(top) ? top : 0) + element.getBoundingClientRect().height;
              return Math.max(bottom, pinnedBottom);
            }, 0);
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
          this.nowTick = Date.now();
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
            this.$nextTick(() => window.setTimeout(() => requestAnimationFrame(() => this.positionRelevantPlan(plan, 'auto')), 60));
          }
        },

        updateCountdown() {
          const now = this.nowTick;
          const tripStartEpoch = new Date('2026-11-28T06:15:00-05:00').getTime();
          const tripEndEpoch = new Date('2026-12-13T19:05:00-05:00').getTime();

          if (now < tripStartEpoch) {
            const diffDays = Math.ceil((tripStartEpoch - now) / (1000 * 60 * 60 * 24));
            this.countdownText = `T-${diffDays}d to JFK`;
          } else if (now <= tripEndEpoch) {
            const liveId = this.liveTripDayId;
            if (liveId) {
              const day = this.days.find(d => d.id === liveId);
              this.countdownText = `Day ${day ? day.dayNum : 'Live'}`;
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
            .replace(/\s*(?:➔|→)\s*/g, '<span class="route-arrow" aria-hidden="true">→</span>&nbsp;')
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
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `taiwan_hong_kong_2026_${item.id}_booking_reminder.ics`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 600);
          this.showToast('Calendar reminder exported');
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

        setAppearance(preference) {
          if (!['system', 'light', 'dark'].includes(preference)) return;
          this.appearance = preference;
          setStorage('twhk_appearance_v1', JSON.stringify(preference));
          this.applyAppearance();
        },

        applyAppUpdate() {
          if (this.appUpdateAvailable) window.dispatchEvent(new Event('twhk-apply-update'));
        },

        applyAppearance() {
          const dark = this.appearance === 'dark' || (this.appearance === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
          document.documentElement.dataset.appearance = dark ? 'dark' : 'light';
          document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content = dark ? 'black-translucent' : 'default';
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

        scrollActiveDayChip(forceCenter = false) {
          const el = document.getElementById('chip-' + this.activeDayId);
          const strip = document.getElementById('day-strip');
          if (!el || !strip) return;

          if (!forceCenter) {
            const itemRect = el.getBoundingClientRect();
            const stripRect = strip.getBoundingClientRect();
            if (itemRect.left >= stripRect.left + 8 && itemRect.right <= stripRect.right - 8) return;
          }

          // Centre by computing the scroll position directly rather than via
          // scrollIntoView({inline:'center'}). scrollIntoView walks every scrollable
          // ancestor (so it can nudge the page vertically too) and its interpretation of
          // `inline` interacts with scroll-padding and scroll-snap differently across
          // engines — on iOS Safari it frequently settles a chip off-centre. This maths is
          // deterministic and only ever moves the strip.
          const delta = el.getBoundingClientRect().left - strip.getBoundingClientRect().left;
          const target = strip.scrollLeft + delta - (strip.clientWidth - el.offsetWidth) / 2;
          const max = strip.scrollWidth - strip.clientWidth;
          strip.scrollTo({
            left: Math.max(0, Math.min(target, max)),
            behavior: this.prefersReducedMotion() ? 'auto' : 'smooth'
          });
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
          if (!('setAppBadge' in navigator)) return;
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
          const minutesLeft = targetMinutes - nowMinutes;

          // More than 90 minutes out: the static fact-card value is enough.
          if (minutesLeft > 90) return null;

          let urgency = 'calm';
          if (minutesLeft <= 0) urgency = 'now';
          else if (minutesLeft <= 10) urgency = 'urgent';
          else if (minutesLeft <= 30) urgency = 'soon';

          const label = minutesLeft <= 0
            ? (minutesLeft === 0 ? 'Leave now' : `${Math.abs(minutesLeft)}m past leave-by`)
            : (minutesLeft >= 60 ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m` : `${minutesLeft}m`);

          return { minutesLeft, urgency, label, key: `${day.id}:${targetMinutes}` };
        },

        get activeLeaveByCountdown() {
          return this.computeLeaveByCountdownForDay(this.currentDay);
        },

        // Fires exactly once per leave-by instance, independent of what the user is
        // currently viewing — a leave-by alert exists specifically to reach you when you're
        // NOT on the relevant screen, so this always checks the LIVE day, not currentDay.
        maybeNotifyLeaveBy() {
          const liveDay = this.days.find(d => d.id === this.liveTripDayId);
          const countdown = this.computeLeaveByCountdownForDay(liveDay);
          if (!countdown || (countdown.urgency !== 'now' && countdown.urgency !== 'urgent')) return;
          if (this._notifiedLeaveByKey === countdown.key) return;
          this._notifiedLeaveByKey = countdown.key;
          if (!('Notification' in window) || Notification.permission !== 'granted') return;
          try {
            const body = countdown.minutesLeft <= 0 ? `Leave now — ${liveDay.leaveByTime}` : `Leave in ${countdown.label} — ${liveDay.leaveByTime}`;
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
        },

        exportState() {
          const statePayload = {
            version: 24,
            exportedAt: new Date().toISOString(),
            activeDayId: this.activeDayId,
            planView: this.planView,
            selectedCurrency: this.selectedCurrency,
            completedDayIds: this.sanitizeIdList(this.completedDayIds, this.days.map(day => day.id)),
            bookedIds: this.sanitizeIdList(this.bookedIds, this.bookings.map(item => item.id)),
            adminPrepDoneIds: this.sanitizeIdList(this.adminPrepDoneIds, this.adminPrepList.map(item => item.id))
          };
          const blob = new Blob([JSON.stringify(statePayload, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `taiwan_hong_kong_2026_user_state_${new Date().toISOString().slice(0,10)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 600);
          this.showToast('Backup downloaded');
        },

        async importStateFile(event) {
          const input = event?.target;
          const file = input?.files?.[0];
          if (!file) return;
          try {
            if (file.size > 1024 * 1024) throw new Error('Backup file is too large');
            const parsed = JSON.parse(await file.text());
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid backup');

            this.completedDayIds = this.sanitizeIdList(parsed.completedDayIds, this.days.map(day => day.id));
            this.bookedIds = this.sanitizeIdList(parsed.bookedIds, this.bookings.map(item => item.id));
            this.adminPrepDoneIds = this.sanitizeIdList(parsed.adminPrepDoneIds, this.adminPrepList.map(item => item.id));
            if (this.days.some(day => day.id === parsed.activeDayId)) {
              this.smartLaunchActive = false;
              this.activeDayId = parsed.activeDayId;
            }
            if (['bookings', 'prep'].includes(parsed.planView)) this.planView = parsed.planView;
            if (['USD', 'TWD', 'HKD'].includes(parsed.selectedCurrency)) this.selectedCurrency = parsed.selectedCurrency;
            this.persistUserState();
            this.syncThemeColor();
            this.refreshIcons();
            this.$nextTick(() => this.scrollActiveDayChip(true));
            this.showToast('Backup restored');
          } catch (error) {
            this.showToast('Invalid backup file');
          } finally {
            if (input) input.value = '';
          }
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
