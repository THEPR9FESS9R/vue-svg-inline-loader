/* require all dependencies */
const { readFileSync } = require('fs')
const path = require('path')
const SVGO = require('svgo')
const svgoConfig = require('./svgo.config')

/* define all regular expressions */
const SVG_MARKER_REGEX = /(<i.*?\/>|<i.*?<\/i>)/
const ATTRIBUTES_REGEX = /(\S*?=".*?")/
const SVG_TAG_REGEX = /(<svg[/| |>])/

/* initialize svg-optimizer */
const svgo = new SVGO(svgoConfig)

/* export loader */
module.exports = function loader(source) {

    /* make this an async Loader */
    const callback = this.async()

    /* tokenize sourcefile */
    let sourceTokens = source.split(SVG_MARKER_REGEX)

    /* look over all tokens and change tokens which match SVG_MARKER_REGEX */
    let promises = sourceTokens.map(sourceToken => {
        return new Promise(resolve => {
            if (SVG_MARKER_REGEX.test(sourceToken)) {

                /* extract all attributes from marker */
                let attrs = extractAttributes(sourceToken)

                /* read svg file */
                let svg = readFileSync(path.resolve(`./${attrs.src}`), 'utf8')

                /* optimize svg */
                svgo.optimize(svg).then(content => {

                    /* inject attribute tokes into svg */
                    let tokens = content.data.split(SVG_TAG_REGEX)
                    tokens = addAttrs(tokens, attrs)
                    resolve(tokens.join(''))
                })
            } else {
                resolve(sourceToken)
            }
        })
    })
    Promise.all(promises).then(tokens => {
        /* create content string and resolve loader promise*/
        callback(null, tokens.join(''))
    })
}

/**
 * 'class' >> 'class'
 * @param String string 
 */
function removeQuotationMarks(string) {
    return string.replace('"', '').replace('"', '')
}

/**
 * <i src="./path/to/svg.svg" class="example"/> => { class: "example", src: "./path/to/svg.svg" }
 * @param String tag <i class="example"/>
 */
function extractAttributes(tag) {
    let result = {}

    tag.split(ATTRIBUTES_REGEX)
        .filter(attr => ATTRIBUTES_REGEX.test(attr))
        .forEach(attr => {
            let keyValuePair = attr.split('=')
            result[keyValuePair[0]] = removeQuotationMarks(keyValuePair[1])
        })

    return result
}

/**
 * inject given attributes into opening svg tag
 * @param { String[] } svgTokens 
 * @param { String, String } attrs 
 */
function addAttrs(svgTokens, attrs) {
    return svgTokens.map(item => {
        if (SVG_TAG_REGEX.test(item)) {
            for (key in attrs) {
                if (key !== 'src') {
                    item += `${key}="${attrs[key]}"`
                }
            }
        }
        return item
    })
}