Pod::Spec.new do |s|
  s.name = 'ListingVideoPreparation'
  s.version = '0.1.0'
  s.summary = 'Owned bounded Listing video preparation'
  s.description = 'AVFoundation preparation boundary for Listing video feasibility.'
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Carberk'
  s.homepage = 'https://github.com/bagtyyarkovusov/auto.tm-rewrite'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => 'https://github.com/bagtyyarkovusov/auto.tm-rewrite.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'CoreMedia', 'CoreVideo'
  s.swift_version = '5.9'
  s.source_files = '**/*.{h,m,mm,swift}'
end
