const puppeteer = require('puppeteer');
const fs = require('fs');
const util = require('util');
const moment = require('moment');

async function filterResults(page, startDate, endDate) {
    const startDateSelector = 'input[name=ddmmaa1]';
    await page.waitForSelector(startDateSelector);
    await page.type(startDateSelector, startDate);
    
    const endDateSelector = 'input[name=ddmmaa2]';
    await page.waitForSelector(endDateSelector);
    await page.type(endDateSelector, endDate);

    const stateSelector = 'input[name^=estado][value=SP]';
    await page.waitForSelector(stateSelector)
    await page.click(stateSelector);

    // Sao Paulo, Sao Caetano, Santo Andre, Sao Bernardo
    await page.waitForSelector('.n-paginas');
    const codCities = [1000, 9500, 9000, 9600];
    for (var i = 0; i < codCities.length; i++) {
        const citySelector = 'input[name^=cod_cidade][value="' + codCities[i] + '"]';
        if (await page.$(citySelector) !== null) {
            await page.click(citySelector);
        }
    }
    await Promise.all([
        page.click('#form-busca input[type=submit]'),
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
    ]);
}

async function getTotalPages(page) {
    await page.waitForSelector('.principal');
    let isEmptyResult = await page.evaluate(() => {
        let texto = document.querySelector('.principal').innerText;
        if (texto.includes('A pesquisa não retornou nenhum resultado')) {
            return true;
        }
        return false;
    });
    if (isEmptyResult) {
        return 0;
    }

    await page.waitForSelector('.n-paginas');
    return await page.evaluate(() => {
        let paginationText = document.querySelector('.n-paginas').innerText;
        console.log('paginationText=' + paginationText);
        let pageAndTotal = paginationText.match(/\d+/g);
        return parseInt(pageAndTotal[1], 10);
    });
}

async function collectResults(page) {
    await page.waitForSelector('.n-paginas');

    return await page.evaluate(() => {
        let data = [];
        const jobResults = document.querySelectorAll('.box-vagas');
        for (var job of jobResults) {
            let infoData = job.querySelector('.info-data').innerText;
            let title = job.querySelector('.cargo').innerText;
            let textData = job.querySelectorAll('.texto > p');
            let description = textData[0].innerText;
            
            let companyAndCode = textData[1].innerText;
            companyAndCode = companyAndCode.replace('Empresa .....: ', '');
            companyAndCode = companyAndCode.replace('Código .......: ', '');
            companyAndCode = companyAndCode.replace(' Envie seu currículo', '');

            let ccSplitted = companyAndCode.split("\n");
            let company = ccSplitted[0];
            let code = ccSplitted[1];
            
            data.push({infoData, title, description, company, code});
        }
        return data;
    });
}

async function gotoNextPage(page) {
    let nextPageSelector = '.paginacao input[type=submit]';
    await page.waitForSelector(nextPageSelector);
    await page.click(nextPageSelector);
}

(async () => {
    // const today = moment().format('DD/MM/YY');
    const today = '11/02/18';
    console.log('scrape date = ' + today);

    const startDate = today;
    const endDate = today;

    let browser = null;
    try {
        browser = await puppeteer.launch({headless: false});
        // browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setViewport({width: 1920, height: 1080});
        await page.goto('http://www.apinfo.com/apinfo/inc/list4.cfm');
        await page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        
        await filterResults(page, startDate, endDate);

        let totalPages = await getTotalPages(page);
        let allResults = [];
        let i = 1;
        while (i <= totalPages) {
            let pageResults = await collectResults(page);
            allResults = allResults.concat(pageResults);
            await gotoNextPage(page);
            console.log('pagina=' + i++ + ' de ' + totalPages);
        }
        
        if (allResults.length > 0) {
            fs.writeFile(util.format('file_scraped_%s.json', today.replace(/[/]/g, '-')), JSON.stringify(allResults), (err) => {  
                if (err) throw err;
                console.log('File saved!');
            });
        } else {
            console.log('Nao houveram resultados');
        }
    } catch (error) {
        console.log(error);
    } finally {
        if (browser != null) {
            await browser.close();
        }
    }
})();
