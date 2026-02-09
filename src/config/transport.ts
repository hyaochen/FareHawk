export const transportCosts: Record<string, Record<string, { cost: number; method: string; duration: string; reference: string }>> = {
    'TPE': {
        '屏東市': { cost: 1300, method: '高鐵左營→桃園 + 機捷（來回）', duration: '約3.5小時', reference: 'https://www.thsrc.com.tw/' },
        '高雄市': { cost: 1100, method: '高鐵左營→桃園 + 機捷（來回）', duration: '約2.5小時', reference: 'https://www.thsrc.com.tw/' },
        '台南市': { cost: 1000, method: '高鐵台南→桃園 + 機捷（來回）', duration: '約2小時', reference: 'https://www.thsrc.com.tw/' },
        '台中市': { cost: 800, method: '高鐵台中→桃園 + 機捷（來回）', duration: '約1.5小時', reference: 'https://www.thsrc.com.tw/' },
        '台北市': { cost: 320, method: '機場捷運（來回）', duration: '約35分鐘', reference: 'https://www.tymetro.com.tw/' },
    },
    'TSA': {
        '屏東市': { cost: 1200, method: '高鐵左營→台北 + 捷運（來回）', duration: '約3小時', reference: 'https://www.thsrc.com.tw/' },
        '高雄市': { cost: 1000, method: '高鐵左營→台北 + 捷運（來回）', duration: '約2.5小時', reference: 'https://www.thsrc.com.tw/' },
        '台北市': { cost: 50, method: '捷運文湖線（來回）', duration: '約15分鐘', reference: 'https://www.metro.taipei/' },
    },
    'KHH': {
        '屏東市': { cost: 160, method: '台鐵區間車（來回）', duration: '約40分鐘', reference: 'https://www.railway.gov.tw/' },
        '高雄市': { cost: 50, method: '捷運紅線（來回）', duration: '約20分鐘', reference: 'https://www.krtc.com.tw/' },
        '台北市': { cost: 1200, method: '高鐵台北→左營 + 捷運（來回）', duration: '約2.5小時', reference: 'https://www.thsrc.com.tw/' },
    },
};
