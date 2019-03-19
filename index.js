/* require all dependencies */
const { readFileSync, existsSync } = require('fs')
const path = require('path')
const SVGO = require('svgo')
const svgoConfig = require('./svgo.config')

/* define all regular expressions */
const SVG_MARKER_REGEX = /(<i.*?\/>|<i.*?<\/i>)/
const ATTRIBUTES_REGEX = /(\S*?=".*?")/
const SVG_TAG_REGEX = /(<svg[/| |>])/

const cache = []

class SVGClass {
    constructor(path, contentRaw, contentOptimized = null, tokens = null) {
        this.path = path
        this.contentRaw = contentRaw
        this.contentOptimized = contentOptimized
        this.tokens = tokens
    }

    getContent() {
        return this.tokens || this.contentOptimized || this.contentRaw
    }

    setContentOptimized(content) {
        this.contentOptimized = content
    }

    setTokens(tokens) {
        this.tokens = tokens
    }

    equals(path) {
        return this.path === path
    }
}

/* initialize svg-optimizer */
const svgo = new SVGO(svgoConfig)

/* export loader */
module.exports = function loader(source) {
    let currentTimeStamp = new Date().getMilliseconds()

    /* make this an async Loader */
    const callback = this.async()

    /* tokenize sourcwefile */
    let sourceTokens = source.split(SVG_MARKER_REGEX)

    /* look over all tokens and change tokens which match SVG_MARKER_REGEX */
    let promises = sourceTokens.map(sourceToken => {
        return new Promise(resolve => {
            if (SVG_MARKER_REGEX.test(sourceToken)) {
                /* extract all attributes from marker */
                let attrs = extractAttributes(sourceToken)

                let absPath = path.resolve(`./${attrs.src}`)
                /* read svg file */
                let svg = checkForCachedSvg(absPath)
                if (!svg && existsSync(absPath)) {
                    svg = readFileSync(absPath, 'utf8')
                } else if (!svg) {
                    resolve(sourceToken)
                }

                if (svg instanceof SVGClass) {
                    /* inject attribute tokes into svg */
                    const content = svg.getContent()
                    let tokens
                    if (content instanceof Array) {
                        tokens = content
                    } else {
                        tokens = content.split(SVG_TAG_REGEX)
                    }

                    tokens = addAttrs(tokens, attrs)
                    resolve(tokens.join(''))
                } else {
                    const svgObj = new SVGClass(absPath, svg)
                    cache.push(svgObj)

                    /* optimize svg */
                    svgo.optimize(svg).then(content => {
                        /* inject attribute tokes into svg */
                        svgObj.setContentOptimized(content.data)
                        let tokens = content.data.split(SVG_TAG_REGEX)
                        svgObj.setTokens(tokens)
                        tokens = addAttrs(tokens, attrs)
                        resolve(tokens.join(''))
                    })
                }
            } else {
                resolve(sourceToken)
            }
        })
    })
    Promise.all(promises).then(tokens => {
        /* create content string and resolve loader promise*/
        console.log(
            `${cache.length} SVG inlined in ${new Date().getMilliseconds() -
                currentTimeStamp}ms`
        )
        callback(null, tokens.join(''))
    })
}

function checkForCachedSvg(path) {
    const result = cache.filter(svg => {
        return svg.equals(path)
    })
    return result.length === 1 ? result[0] : null
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
