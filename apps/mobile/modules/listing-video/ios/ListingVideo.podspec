require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ListingVideo'
  s.version        = package['version']
  s.summary        = 'Listing video preparation: interval trim and 720p re-encode (#1039)'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'Carberk'
  s.homepage       = 'https://github.com/Carberk/carberk'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Carberk/carberk.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
