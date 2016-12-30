const fs = require('fs');
const fetch = require('isomorphic-fetch');
const cheerio = require('cheerio');

let bid;

const people = process.env.PEOPLE.trim();
if (people == undefined) {
  throw Error('请指定用户id');
}

const dir = 'result';
if (!fs.existsSync('result')) {
  fs.mkdirSync(dir);
}

// 获取bid，请求任何页面时必须带上bid，否则豆瓣会返回403
const getBid = () => fetch('https://www.douban.com')
  .then(res => res.headers.get('x-douban-newbid'));

// 获取任意页面的html文本
const getPage = (url) => fetch(url, {
  headers: {
    Cookie: `bid=${bid}`,
  },
}).then(res => res.text());

// 爬取书影音记录
const fetchDataByType = async (type) => {
  const states = ['do', 'wish', 'collect'];
  const isBook = type === 'book';
  
  const getItemsPerPage = ($) => {
    const pageItems = [];
    if (isBook) {
      $('.subject-item').each((i, item) => {
       const title = $(item).find('h2').text().replace(/\s/g, '');
       const date = $(item).find('.date').text().replace(/(.*)\s.*/, '$1');
       const comment = $(item).find('.comment').text().trim();

       pageItems.push(`[${date}] ${title}${comment ? ` "${comment}"` : ''}`);
      });
    } else {
      $('.grid-view .item').each((i, item) => {
        const title = $(item).find('.title em').text();
        const date = $(item).find('.date').text();
        const comment = $(item).find('.comment').text();
        
        pageItems.push(`[${date}] ${title}${comment ? ` 【${comment}"】` : ''}`);
      });
    }
    
    return pageItems;
  }

  const fetchItemsByState = async (state) => {
    const url = `https://${type}.douban.com/people/${people}/${state}`;
    const items = [];

    const firstPage = await getPage(url);
    const $firstPage = cheerio.load(firstPage);
    const totalPage = $firstPage('.paginator > a').last().text() || 1;

    items.push(...getItemsPerPage($firstPage));

    for (let i = 2; i <= totalPage; i++) {
      const page = await getPage(`${url}?start=${(i - 1) * 15}&sort=time`);
      items.push(...getItemsPerPage(cheerio.load(page)));
    }

    return items;
  };

  const allItems = await Promise.all(states.map(state => fetchItemsByState(state)));
  const data = allItems.map(item => item.join('\n')).join('\n\n');
  fs.writeFile(`${dir}/${people}.${type}.txt`, data, (err) => {
    if (!err) {
      console.log(`fetched ${type} data successfully`);
    }
  });
};

// 爬取日记
const fetchNotes = async () => {
  const firstPage = await getPage(`https://www.douban.com/people/${people}/notes`);
  const $firstPage = cheerio.load(firstPage);
  const totalPage = $firstPage('.paginator > .thispage').attr('data-total-page');

  const getNoteUrlsPerPage = ($) => {
    const pageUrls = [];

    $('.note-header-container > h3 > a')
      .each((i, link) => {
        let href = $(link).attr('href');
        href = decodeURIComponent(href.replace(/.*url=(.*)&type.*/, '$1'));
        pageUrls.push(href);
      });

    return pageUrls;
  }

  const fetchNodeByUrl = async (url) => {
    const notePage = await getPage(url);
    const $ = cheerio.load(notePage);

    let note = '';
    note += $('.note-header > h1').text();
    note += '\n';
    note += $('.pub-date').text();
    note += '\n';
    note += $('.note').text();

    return note;
  }

  const urls = [];
  urls.push(...getNoteUrlsPerPage($firstPage));

  for (let i = 2; i <= totalPage; i++) {
    const page = await getPage(`https://www.douban.com/people/${people}/notes?start=${(i - 1) * 10}&type=note`);
    urls.push(...getNoteUrlsPerPage(cheerio.load(page)));
  }

  const notes = await Promise.all(urls.map(url => fetchNodeByUrl(url)));
  fs.writeFile(`${dir}/${people}.notes.txt`, notes.join('\n\n'), (err) => {
    if (!err) {
      console.log('fetch notes successfully');
    }
  });
}

// 执行
(async () => {
  bid = await getBid();

  fetchDataByType('book');
  fetchDataByType('movie');
  fetchDataByType('music');

  fetchNotes();
})();
